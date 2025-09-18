const prisma = require("../prismaClient");

function groupBy(arr, getKey) {
    return arr.reduce((acc, item) => {
        const k = getKey(item);
        (acc[k] ||= []).push(item);
        return acc;
    }, {});
}

function deriveGroupName(a) {
    if (a.category) return a.category;
    if (a.type) return a.type;
    if (a.title) {
        const m = a.title.match(/^\s*([A-Za-z ]*?[A-Za-z])(?:\s+\d+)?\s*$/);
        if (m && m[1]) return m[1].trim();
    }
    if (a.conditions?.toLowerCase().includes("lesson")) return "Lesson Master";
    if (a.conditions?.toLowerCase().includes("streak")) return "Streak";
    if (a.conditions?.toLowerCase().includes("xp")) return "XP Hunter";
    if (a.conditions?.toLowerCase().includes("practice")) return "Practice Champ";
    if (a.conditions?.toLowerCase().includes("correct")) return "Sharp Mind";
    return "Misc";
}

async function unlock(userId, achievementId) {
    return prisma.user_achievements.upsert({
        where: { user_id_achievement_id: { user_id: userId, achievement_id: achievementId } },
        update: {},
        create: { user_id: userId, achievement_id: achievementId, unlocked_at: new Date() },
    });
}

async function evaluateCondition(userId, condition) {
    const stats = (await prisma.user_stats.findUnique({ where: { user_id: userId } })) || {};
    const practiceCount = await prisma.daily_practice.count({ where: { user_id: userId, status: "completed" } });
    const correctAnswers = await prisma.practice_item.count({
        where: { daily_practice: { user_id: userId }, is_correct: true },
    });
    const completedLessons = await prisma.user_completed_lessons.count({ where: { user_id: userId } });

    const c = (condition || "").toLowerCase();

    if (c.includes("lesson")) return completedLessons >= parseInt(c, 10);
    if (c.includes("streak")) return (stats.streak || 0) >= parseInt(c, 10);
    if (c.includes("xp")) return (stats.xp || 0) >= parseInt(c, 10);
    if (c.includes("practice")) return practiceCount >= parseInt(c, 10);
    if (c.includes("correct")) return correctAnswers >= parseInt(c, 10);
    if (c.includes("1st correct") || c.includes("first correct")) return correctAnswers > 0;

    return false;
}

async function checkAchievements(userId) {
    const allAchievements = await prisma.achievements.findMany();
    const unlocked = await prisma.user_achievements.findMany({
        where: { user_id: userId },
        select: { achievement_id: true },
    });
    const unlockedIds = new Set(unlocked.map((u) => u.achievement_id));

    for (const ach of allAchievements) {
        if (!unlockedIds.has(ach.id)) {
            const shouldUnlock = await evaluateCondition(userId, ach.conditions);
            if (shouldUnlock) await unlock(userId, ach.id);
        }
    }
}

const getAllAchievements = async (req, res) => {
    try {
        const userId = req.user.id;
        await checkAchievements(userId);

        const all = await prisma.achievements.findMany();
        const unlocked = await prisma.user_achievements.findMany({
            where: { user_id: userId },
        });

        const unlockedIds = new Set(unlocked.map((u) => u.achievement_id));
        const merged = all.map((a) => ({
            ...a,
            unlocked: unlockedIds.has(a.id),
            unlocked_at: unlocked.find((u) => u.achievement_id === a.id)?.unlocked_at || null,
            _group: deriveGroupName(a),
        }));

        const allGrouped = groupBy(merged, (a) => a._group);

        const completedOnly = merged.filter((a) => a.unlocked);
        const completedGrouped = groupBy(completedOnly, (a) => a._group);

        const summary = {};
        for (const [g, arr] of Object.entries(allGrouped)) {
            summary[g] = {
                total: arr.length,
                unlocked: arr.filter((x) => x.unlocked).length,
            };
        }

        const stripInternal = (obj) =>
            Object.fromEntries(
                Object.entries(obj).map(([g, arr]) => [
                    g,
                    arr.map(({ _group, ...rest }) => rest),
                ])
            );

        return res.json({
            status: true,
            message: "Achievements grouped",
            data: {
                all: stripInternal(allGrouped),
                completed: stripInternal(completedGrouped),
                summary: {
                    total: merged.length,
                    unlocked: completedOnly.length,
                    byGroup: summary,
                },
            },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

const getUserAchievements = async (req, res) => {
    try {
        const userId = req.user.id;
        await checkAchievements(userId);

        const all = await prisma.achievements.findMany();
        const unlocked = await prisma.user_achievements.findMany({ where: { user_id: userId } });
        const unlockedIds = new Set(unlocked.map((u) => u.achievement_id));

        const merged = all.map((a) => ({
            ...a,
            unlocked: unlockedIds.has(a.id),
            unlocked_at: unlocked.find((u) => u.achievement_id === a.id)?.unlocked_at || null,
        }));

        return res.json({ status: true, message: "All achievements fetched", data: merged });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

module.exports = {
    checkAchievements,
    getAllAchievements,
    getUserAchievements,
};
