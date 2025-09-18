// ads.controller.js
const prisma = require("../prismaClient");
const { ensureStatsWithRefill, getSettings } = require("./progress.controller");

const rewardHeartsForAd = async (req, res) => {
    try {
        const userId = req.user.id;
        const s = await getSettings();

        if (s.enable_ads !== 1) {
            return res.status(403).json({
                status: false,
                message: "Ads are disabled by settings.",
            });
        }

        // ensure stats (with lazy refill)
        let stats = await ensureStatsWithRefill(userId);

        const currentHearts = stats.hearts ?? 0;
        const add = s.hearts_per_ad_watch > 0 ? s.hearts_per_ad_watch : 0;

        if (currentHearts >= s.max_hearts || add === 0) {
            // no-op (already full or nothing to add)
            return res.json({
                status: true,
                message: "Hearts already full (or no increment configured).",
                data: {
                    awarded: 0,
                    hearts: currentHearts,
                    max_hearts: s.max_hearts,
                },
            });
        }

        const spaceLeft = Math.max(0, s.max_hearts - currentHearts);
        const awarded = Math.min(spaceLeft, add);
        const newHearts = currentHearts + awarded;

        stats = await prisma.user_stats.update({
            where: { user_id: userId },
            data: {
                hearts: newHearts,
                updated_at: new Date(),
            },
        });

        return res.json({
            status: true,
            message: "Hearts rewarded for ad watch.",
            data: {
                awarded,
                hearts: stats.hearts,
                max_hearts: s.max_hearts,
            },
        });
    } catch (err) {
        console.error("rewardHeartsForAd error:", err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

const rewardGemsForAd = async (req, res) => {
    try {
        const userId = req.user.id;
        const s = await getSettings();

        if (s.enable_ads !== 1) {
            return res.status(403).json({
                status: false,
                message: "Ads are disabled by settings.",
            });
        }

        const add = s.gems_per_ad_watch > 0 ? s.gems_per_ad_watch : 0;
        if (add === 0) {
            return res.json({
                status: true,
                message: "No gem increment configured.",
                data: { awarded: 0 },
            });
        }

        await ensureStatsWithRefill(userId);

        const stats = await prisma.user_stats.update({
            where: { user_id: userId },
            data: {
                gems: { increment: add },
                updated_at: new Date(),
            },
        });

        return res.json({
            status: true,
            message: "Gems rewarded for ad watch.",
            data: {
                awarded: add,
                gems: stats.gems,
            },
        });
    } catch (err) {
        console.error("rewardGemsForAd error:", err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

const buyHeartsWithGems = async (req, res) => {
  try {
    const userId = req.user.id;
    const { cost, quantity = 1 } = req.body || {};

    if (!Number.isInteger(cost) || cost <= 0) {
      return res.status(400).json({ status: false, message: "Invalid cost." });
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ status: false, message: "Invalid quantity." });
    }

    const s = await getSettings();
    if (s.enable_ads !== 1) {
      return res.status(403).json({
        status: false,
        message: "Purchases are disabled by settings.",
      });
    }

    await ensureStatsWithRefill(userId);

    const result = await prisma.$transaction(async (tx) => {
      const stats = await tx.user_stats.findUnique({
        where: { user_id: userId },
        select: { gems: true, hearts: true },
      });

      if (!stats) {
        throw new Error("User stats not found.");
      }

      const spaceLeft = Math.max(0, s.max_hearts - (stats.hearts ?? 0));
      if (spaceLeft <= 0) {
        return {
          ok: false,
          status: 400,
          message: "Hearts already full.",
          data: { hearts: stats.hearts, max_hearts: s.max_hearts, gems: stats.gems },
        };
      }

      const awarded = Math.min(quantity, spaceLeft);

      const totalCost = cost;

      if ((stats.gems ?? 0) < totalCost) {
        return {
          ok: false,
          status: 400,
          message: "Not enough gems.",
          data: { required: totalCost, gems: stats.gems },
        };
      }

      const updated = await tx.user_stats.update({
        where: { user_id: userId },
        data: {
          gems: { decrement: totalCost },
          hearts: Math.min(s.max_hearts, (stats.hearts ?? 0) + awarded),
          updated_at: new Date(),
        },
        select: { gems: true, hearts: true },
      });

      return {
        ok: true,
        status: 200,
        message: "Hearts purchased successfully.",
        data: {
          awarded,
          cost: totalCost,
          hearts: updated.hearts,
          max_hearts: s.max_hearts,
          gems: updated.gems,
        },
      };
    });

    if (!result.ok) {
      return res.status(result.status).json({ status: false, message: result.message, data: result.data });
    }
    return res.json({ status: true, message: result.message, data: result.data });
  } catch (err) {
    console.error("buyHeartsWithGems error:", err);
    return res.status(500).json({ status: false, message: err.message });
  }
};

module.exports = {
    rewardHeartsForAd,
    rewardGemsForAd
};
