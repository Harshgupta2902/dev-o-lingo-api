const dayjs = require("dayjs");
const prisma = require("../prismaClient");
const { updateLeaderboard } = require("./leaderboard.controller");

function ymd(d = new Date()) {
    return dayjs(d).format("YYYY-MM-DD");
}
function toDateOnly(s) {
    // 00:00:00 UTC (date-only)
    return new Date(`${s}T00:00:00.000Z`);
}
function startOfWeek(d = dayjs()) {
    // Monday as start (0=Sun, 1=Mon) -> shift to Monday
    const dow = d.day(); // 0..6 (Sun..Sat)
    const delta = (dow + 6) % 7; // days since Monday
    return d.subtract(delta, "day").startOf("day");
}
function buildWeekDates() {
    const start = startOfWeek(dayjs());
    return Array.from({ length: 7 }, (_, i) => start.add(i, "day").format("YYYY-MM-DD"));
}
function shortAgo(dt) {
    const a = dayjs();
    const b = dayjs(dt);
    const sec = a.diff(b, "second");
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.floor(hr / 24);
    return `${d}d ago`;
}

const getWeek = async (req, res) => {
    try {
        const userId = req.user.id;
        const todayStr = ymd();

        const dates = buildWeekDates();
        const from = toDateOnly(dates[0]);
        const to = toDateOnly(dates[6]);

        // 2) Resolve language + settings
        const sizeSetting = await prisma.game_settings.findUnique({ where: { key: "daily_practice_size" } });
        const dailySize = Number(sizeSetting?.value) || 10;

        const progress = await prisma.user_progress.findUnique({ where: { user_id: userId } });
        if (!progress) return res.status(400).json({ status: false, message: "User progress not found" });

        let languageId = Number(progress.language_id);
        if (!languageId) {
            const lang = await prisma.languages.findFirst({ where: { code: progress.lang } });
            languageId = lang?.id || 0;
        }
        if (!languageId) return res.status(400).json({ status: false, message: "Learning language not resolved" });

        const used = await prisma.practice_item.findMany({
            where: { daily_practice: { user_id: userId } },
            select: { question_id: true },
        });
        const excludeIds = used.map(u => u.question_id);

        let rows = await prisma.daily_practice.findMany({
            where: {
                user_id: userId,
                date: { gte: from, lte: to },
            },
            include: { items: true },
            orderBy: { date: "asc" },
        });

        const have = new Set(rows.map(r => ymd(r.date)));
        for (const d of dates) {
            if (have.has(d)) continue;
            const isFutureOrToday = !dayjs(d).isBefore(todayStr);
            if (!isFutureOrToday) continue;

            // pick questions
            const qs = await prisma.questions.findMany({
                where: { language_id: languageId, id: { notIn: excludeIds } },
                orderBy: { id: "asc" },
                take: dailySize,
            });

            // top up if bank small
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

        // 6) Shape UI tiles
        const map = new Map(rows.map(r => [ymd(r.date), r]));
        const practices = dates.map(d => {
            const p = map.get(d);
            const isToday = d === todayStr;
            const isFuture = dayjs(d).isAfter(todayStr);
            const isPast = dayjs(d).isBefore(todayStr);

            const items = p?.items || [];
            const total = items.length;
            const answered = items.filter(i => i.question_status === "answered").length;
            const correct = items.filter(i => i.is_correct === true).length;
            const wrong = answered - correct;
            const skipped = items.filter(i => i.question_status === "skipped").length;

            let status;
            if (p) {
                if (p.status === "completed") status = "completed";
                else if (isFuture) status = "locked";
                else if (isToday) status = "available";
                else status = "missed"; // past assigned but not completed
            } else {
                // no row on that day
                if (isFuture) status = "locked";
                else if (isToday) status = "available"; // will be lazily created on open
                else status = "missed"; // past, no row
            }

            return {
                date: d,
                isToday,
                status,                 // available | locked | completed | missed
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

        const PRIORITY = { available: 0, completed: 1, locked: 2, missed: 3 };
        practices.sort((a, b) => {
            const pa = PRIORITY[a.status] ?? 9;
            const pb = PRIORITY[b.status] ?? 9;
            if (pa !== pb) return pa - pb;
            return a.date.localeCompare(b.date);
        });


        return res.json({
            status: true,
            message: "This week (Mon–Sun) + auto-schedule for today/future",
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

const getReviewSet = async (req, res) => {
    try {
        const userId = req.user.id;

        const baseWhere = {
            daily_practice: { user_id: userId, },
            OR: [
                { question_status: "skipped" },
                { question_status: "answered", is_correct: false },
            ],
        };

        let reviewItems = await prisma.practice_item.findMany({
            where: baseWhere,
            include: {
                question: true,
                daily_practice: { select: { id: true, date: true, status: true } },
            },
            orderBy: [{ id: "asc" }],
        });

        let items = reviewItems.map((it) => ({
            itemId: it.id,
            practiceId: it.daily_practice.id,
            practiceDate: dayjs(it.daily_practice.date).format("YYYY-MM-DD"),
            practiceStatus: it.daily_practice.status,
            questionId: it.question_id,
            type: it.question_status === "skipped" ? "skipped" : "wrong",
            userAnswer: it.user_answer ?? null,
            question: it.question,
        }));

        if (items.length > 1) {
            for (let i = items.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [items[i], items[j]] = [items[j], items[i]];
            }
        }

        return res.json({
            status: true,
            message: "User-wide skipped & wrong questions (all practices)",
            data: items,
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
    getReviewSet
};