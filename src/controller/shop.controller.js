const prisma = require("../prismaClient");
const { google } = require("googleapis");

// ---------- helpers ----------
const asInt = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
};

function ok(res, data, message = "OK") {
    return res.json({ status: true, message, data });
}
function bad(res, message, code = 400) {
    return res.status(code).json({ status: false, message });
}
function srv(res, err) {
    console.error("[SHOP] Error:", err);
    return res.status(500).json({ status: false, message: err.message || "Server error" });
}

async function getMaxHearts() {
    const s = await prisma.game_settings.findFirst({ where: { key: "max_hearts" } });
    return asInt(s?.value ?? 5, 5);
}

async function creditUserForPurchase(userId, shopItem) {
    if (!shopItem) return;

    if (shopItem.type === "gems") {
        const qty = asInt(shopItem.quantity, 0);
        if (qty > 0) {
            await prisma.user_stats.upsert({
                where: { user_id: Number(userId) },
                update: { gems: { increment: qty } },
                create: { user_id: Number(userId), gems: qty, hearts: 0, xp: 0, streak: 0 },
            });
        }
        return;
    }

    if (shopItem.type === "hearts") {
        const qty = asInt(shopItem.quantity, 0);
        if (qty > 0) {
            const maxHearts = await getMaxHearts();
            const cs = await prisma.user_stats.findUnique({ where: { user_id: Number(userId) } });
            const current = asInt(cs?.hearts ?? 0, 0);
            const next = Math.min(current + qty, maxHearts);

            if (cs) {
                await prisma.user_stats.update({
                    where: { user_id: Number(userId) },
                    data: { hearts: next },
                });
            } else {
                await prisma.user_stats.create({
                    data: { user_id: Number(userId), gems: 0, hearts: Math.min(qty, maxHearts), xp: 0, streak: 0 },
                });
            }
        }
        return;
    }

    if (shopItem.type === "booster") {
        // TODO: booster grant
        return;
    }

    if (shopItem.type === "subscription") {
        // TODO: handle subscription logic
        return;
    }
}

async function verifyGooglePlayPurchase({ purchaseToken, productId }) {
    const packageName = process.env.PLAY_PACKAGE_NAME;
    if (!packageName) throw new Error("PLAY_PACKAGE_NAME env is missing");

    const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEYFILE || process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });
    const client = await auth.getClient();
    const androidpublisher = google.androidpublisher({ version: "v3", auth: client });

    try {
        const res = await androidpublisher.purchases.products.get({
            packageName,
            productId,
            token: purchaseToken,
        });
        const data = res.data || {};
        const purchased = data.purchaseState === 0 || data.purchaseState === undefined;
        return { success: purchased, payload: data, kind: "product" };
    } catch (err1) {
        try {
            const res = await androidpublisher.purchases.subscriptions.get({
                packageName,
                subscriptionId: productId,
                token: purchaseToken,
            });
            const data = res.data || {};
            const valid = !!data?.kind;
            return { success: valid, payload: data, kind: "subscription" };
        } catch (err2) {
            console.error("[PLAY VERIFY] both failed", err1?.message, err2?.message);
            return { success: false, payload: { err1: err1?.message, err2: err2?.message } };
        }
    }
}

// ---------------- CONTROLLERS ----------------

const getShopItems = async (req, res) => {
    try {
        const items = await prisma.shop_items.findMany({
            where: { is_active: true },
            orderBy: [{ type: "asc" }, { price_inr: "asc" }],
        });

        // Group by type
        const grouped = items.reduce((acc, item) => {
            if (!acc[item.type]) acc[item.type] = [];
            acc[item.type].push(item);
            return acc;
        }, {});

        return ok(res, grouped);
    } catch (err) {
        return srv(res, err);
    }
};


const createOrder = async (req, res) => {
    try {
        const userId = Number(req.user?.id);
        if (!userId) return bad(res, "Unauthorized", 401);

        const { shop_item_id } = req.body || {};
        if (!shop_item_id) return bad(res, "shop_item_id required");

        const item = await prisma.shop_items.findUnique({ where: { id: Number(shop_item_id) } });
        if (!item || !item.is_active) return bad(res, "Item not found or inactive", 404);

        const order = await prisma.purchase_orders.create({
            data: {
                user_id: userId,
                shop_item_id: item.id,
                sku: item.sku,
                amount: item.price_inr,
                currency: item.currency,
                status: "pending_verification",
                platform: "playstore",
            },
        });

        return ok(res, order, "Order created");
    } catch (err) {
        return srv(res, err);
    }
};

const verifyPurchase = async (req, res) => {
    try {
        const userId = Number(req.user?.id);
        if (!userId) return bad(res, "Unauthorized", 401);

        const { orderId, purchaseToken, productId, platformOrderId } = req.body || {};
        if (!orderId || !purchaseToken || !productId) {
            return bad(res, "orderId, productId and purchaseToken required");
        }

        const order = await prisma.purchase_orders.findUnique({ where: { id: Number(orderId) } });
        if (!order) return bad(res, "Order not found", 404);
        if (order.user_id !== userId) return bad(res, "Not your order", 403);

        if (order.status === "completed") {
            const existingTx = await prisma.transactions.findFirst({
                where: { order_id: order.id, status: "success" },
                orderBy: { created_at: "desc" },
            });
            return ok(res, { order, tx: existingTx }, "Already completed");
        }

        const duplicateTokenTx = await prisma.transactions.findFirst({
            where: { platform: "playstore", platform_token: purchaseToken, status: "success" },
        });
        if (duplicateTokenTx) {
            if (order.status !== "completed") {
                await prisma.purchase_orders.update({
                    where: { id: order.id },
                    data: { status: "completed" },
                });
                const shopItem = await prisma.shop_items.findUnique({ where: { id: order.shop_item_id } });
                await creditUserForPurchase(userId, shopItem);
            }
            return ok(res, { orderId: order.id, tx: duplicateTokenTx }, "Token already processed");
        }

        const verification = await verifyGooglePlayPurchase({ purchaseToken, productId });
        const txStatus = verification?.success ? "success" : "failed";

        const tx = await prisma.transactions.create({
            data: {
                user_id: userId,
                order_id: order.id,
                shop_item_id: order.shop_item_id,
                amount: order.amount,
                currency: order.currency,
                platform: "playstore",
                platform_token: purchaseToken,
                platform_payload: verification?.payload ? JSON.stringify(verification.payload) : null,
                status: txStatus,
            },
        });

        if (!verification?.success) {
            await prisma.purchase_orders.update({
                where: { id: order.id },
                data: { status: "failed", platform_order_id: platformOrderId || order.platform_order_id },
            });
            return bad(res, "Purchase verification failed");
        }

        await prisma.purchase_orders.update({
            where: { id: order.id },
            data: { status: "completed", platform_order_id: platformOrderId || order.platform_order_id },
        });

        const shopItem = await prisma.shop_items.findUnique({ where: { id: order.shop_item_id } });
        await creditUserForPurchase(userId, shopItem);

        return ok(res, { tx }, "Purchase verified and credited");
    } catch (err) {
        return srv(res, err);
    }
};

module.exports = {
    getShopItems,
    createOrder,
    verifyPurchase,
};
