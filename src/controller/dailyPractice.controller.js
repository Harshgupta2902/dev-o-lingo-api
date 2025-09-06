const dayjs = require("dayjs");
const prisma = require("../prismaClient");
const { updateLeaderboard } = require("./leaderboard.controller");

function ymd(d = new Date()) { return dayjs(d).format("YYYY-MM-DD"); }
function toDateOnly(s) { return new Date(`${s}T00:00:00.000Z`); }

function buildWeekDates({ full = false } = {}) {
    const today = dayjs();
    const dow = today.day();
    const isoDow = dow === 0 ? 7 : dow;

    const startOfWeek = today.subtract(isoDow - 1, "day");
    const endOfWeek = startOfWeek.add(6, "day");

    let start = full ? startOfWeek : today;
    const days = endOfWeek.diff(start, "day") + 1;

    return Array.from({ length: days }, (_, i) => start.add(i, "day").format("YYYY-MM-DD"));
}


async function resolveLanguageId(progress) {
    if (progress?.language_id) return Number(progress.language_id);
    if (progress?.lang) {
        const lang = await prisma.languages.findFirst({ where: { code: progress.lang } });
        return lang?.id || 0;
    }
    return 0;
}

async function pickQuestions(languageId, limit, excludeIds = []) {
    return prisma.questions.findMany({
        where: { language_id: languageId, id: { notIn: excludeIds } },
        orderBy: { id: "asc" },
        take: limit,
    });
}

function shortAgo(date) {
    if (!date) return null;
    const diffMin = dayjs().diff(dayjs(date), "minute");
    if (diffMin < 1) return "now";
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d`;
    const diffW = Math.floor(diffDay / 7);
    return `${diffW}w`;
}

const getWeek = async (req, res) => {
    try {
        const userId = req.user.id;
        const todayStr = ymd();

        // 👇 if you want whole week always, hit /daily-practice/week?full=1
        const wantFull = String(req.query.full || "").trim() === "1";
        const dates = buildWeekDates({ full: wantFull });
        const dateObjs = dates.map(toDateOnly);

        // settings, progress, languageId (unchanged)
        const sizeSetting = await prisma.game_settings.findUnique({ where: { key: "daily_practice_size" } });
        const dailySize = Number(sizeSetting?.value) || 10;

        const progress = await prisma.user_progress.findUnique({ where: { user_id: userId } });
        if (!progress) return res.status(400).json({ status: false, message: "User progress not found" });

        // resolve language id (same as before)
        let languageId = Number(progress.language_id);
        if (!languageId) {
            const lang = await prisma.languages.findFirst({ where: { code: progress.lang } });
            languageId = lang?.id || 0;
        }
        if (!languageId) return res.status(400).json({ status: false, message: "Learning language not resolved" });

        // prevent repeats (same as before)
        const used = await prisma.practice_item.findMany({
            where: { daily_practice: { user_id: userId } },
            select: { question_id: true },
        });
        const excludeIds = used.map(u => u.question_id);

        // fetch existing rows for THIS (partial) week window
        let rows = await prisma.daily_practice.findMany({
            where: { user_id: userId, date: { in: dateObjs } },
            include: { items: true },
            orderBy: { date: "asc" },
        });

        // create missing days only for remaining week window
        const have = new Set(rows.map(r => ymd(r.date)));
        const missing = dates.filter(d => !have.has(d));

        for (const d of missing) {
            // pick questions (as before)
            const qs = await prisma.questions.findMany({
                where: { language_id: languageId, id: { notIn: excludeIds } },
                orderBy: { id: "asc" },
                take: dailySize,
            });

            // top-up reuse if bank small
            let finalQs = qs;
            if (qs.length < dailySize) {
                const topUp = await prisma.questions.findMany({
                    where: { language_id: languageId },
                    take: dailySize - qs.length,
                });
                const seen = new Set(qs.map(q => q.id));
                finalQs = [...qs, ...topUp.filter(q => !seen.has(q.id))];
            }
            if (finalQs.length === 0) break;

            excludeIds.push(...finalQs.map(q => q.id));

            const created = await prisma.daily_practice.create({
                data: {
                    user_id: userId,
                    date: toDateOnly(d),
                    status: "assigned",
                    items: { create: finalQs.map(q => ({ question_id: q.id, question_status: "pending" })) },
                },
                include: { items: true },
            });
            rows.push(created);
        }

        rows.sort((a, b) => new Date(a.date) - new Date(b.date));

        // shape output as "practices" (same as last message, kept intact)
        const map = new Map(rows.map(r => [ymd(r.date), r]));
        const practices = dates.map(d => {
            const p = map.get(d);
            const isToday = d === todayStr;
            const isFuture = dayjs(d).isAfter(todayStr);

            const items = p?.items || [];
            const total = items.length;
            const answered = items.filter(i => i.question_status === "answered").length;
            const correct = items.filter(i => i.is_correct === true).length;
            const wrong = answered - correct;
            const skipped = items.filter(i => i.question_status === "skipped").length;

            const status = p
                ? (p.status === "completed" ? "completed" : (isFuture ? "locked" : "available"))
                : (isFuture ? "locked" : "available");

            return {
                date: d,
                isToday,
                status,
                practiceId: p?.id || null,
                total,
                done: answered,
                earned_xp: p?.earned_xp || 0,
                earned_gems: p?.earned_gems || 0,
                completed_at: p?.completed_at || null,
                completed_at_ago: p?.completed_at ? shortAgo(p.completed_at) : null,
                summary: { total, answered, correct, wrong, skipped },
            };
        });

        return res.json({
            status: true,
            message: wantFull ? "Full week (Mon–Sun) + auto-schedule" : "Remaining of this week + auto-schedule",
            data: { practices },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};


const getPracticeById = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.body;

        const p = await prisma.daily_practice.findUnique({
            where: { id: Number(id) },
            include: { items: { include: { question: true } } },
        });
        if (!p || p.user_id !== userId) {
            return res.status(404).json({ status: false, message: "Practice not found" });
        }

        const d = ymd(p.date);
        const todayStr = ymd();

        if (p.status !== "completed" && d !== todayStr) {
            return res.status(403).json({ status: false, message: "This practice unlocks on its date" });
        }

        return res.json({ status: true, message: "Practice fetched", data: p });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};


// 🔑 Submit all answers
const submitPractice = async (req, res) => {
    try {
        const userId = req.user.id;
        const { practiceId, answers } = req.body;

        const practice = await prisma.daily_practice.findUnique({
            where: { id: practiceId },
            include: { items: true },
        });

        if (!practice || practice.user_id !== userId) {
            return res.status(404).json({ status: false, message: "Practice not found" });
        }

        const dateStr = ymd(practice.date);
        const todayStr = ymd();

        if (practice.status === "completed") {
            return res.status(400).json({ status: false, message: "Practice already submitted" });
        }
        if (dateStr !== todayStr) {
            return res.status(403).json({ status: false, message: "You can only submit today's practice" });
        }

        let correct = 0, wrong = 0, skipped = 0;

        for (const item of practice.items) {
            const ans = answers[item.question_id];
            if (!ans) continue;

            if (ans.status === "skipped") {
                skipped++;
                await prisma.practice_item.update({
                    where: { id: item.id },
                    data: { question_status: "skipped" },
                });
            } else if (ans.status === "answered") {
                const q = await prisma.questions.findUnique({ where: { id: item.question_id } });
                const isCorrect = (q?.answer || "").trim().toLowerCase() === (ans.answer || "").trim().toLowerCase();
                if (isCorrect) correct++; else wrong++;

                await prisma.practice_item.update({
                    where: { id: item.id },
                    data: {
                        question_status: "answered",
                        user_answer: ans.answer,
                        is_correct: isCorrect,
                    },
                });
            }
        }

        const settings = await prisma.game_settings.findMany({
            where: { key: { in: ["practice_full_xp", "practice_full_gems"] } },
        });
        const s = Object.fromEntries(settings.map(k => [k.key, parseInt(k.value, 10)]));
        const total = correct + wrong + skipped;
        const fullXp = s.practice_full_xp || 30;
        const fullGems = s.practice_full_gems || 50;

        let earnedXp = 0, earnedGems = 0;
        if (wrong === 0 && skipped === 0) {
            earnedXp = fullXp; earnedGems = fullGems;
        } else {
            earnedXp = Math.floor((fullXp / total) * correct);
            earnedGems = Math.floor((fullGems / total) * correct);
        }

        const updatedStats = await prisma.user_stats.upsert({
            where: { user_id: userId },
            update: { xp: { increment: earnedXp }, gems: { increment: earnedGems }, updated_at: new Date() },
            create: { user_id: userId, xp: earnedXp, gems: earnedGems, hearts: 5 },
        });

        await prisma.daily_practice.update({
            where: { id: practiceId },
            data: {
                status: "completed",
                completed_at: new Date(),
                earned_xp: earnedXp,
                earned_gems: earnedGems,
            },
        });

        await updateLeaderboard(userId, earnedXp);
        // optionally: await checkAchievements(userId);

        return res.json({
            status: true,
            message: "Practice submitted",
            data: {
                correct, wrong, skipped, total,
                earnedXp, earnedGems,
                totalXp: updatedStats.xp, totalGems: updatedStats.gems,
            },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

module.exports = {
    getWeek,
    getPracticeById,
    submitPractice,
};