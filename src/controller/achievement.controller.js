const prisma = require("../prismaClient");

// ✅ Unlock if not already unlocked
async function unlock(userId, achievementId) {
    return prisma.user_achievements.upsert({
        where: { user_id_achievement_id: { user_id: userId, achievement_id: achievementId } },
        update: {},
        create: { user_id: userId, achievement_id: achievementId, unlocked_at: new Date() },
    });
}

async function evaluateCondition(userId, condition) {
    const stats = await prisma.user_stats.findUnique({ where: { user_id: userId } }) || {};
    const practiceCount = await prisma.daily_practice.count({ where: { user_id: userId, status: "completed" } });
    const correctAnswers = await prisma.practice_item.count({
        where: { daily_practice: { user_id: userId }, is_correct: true },
    });
    const completedLessons = await prisma.user_completed_lessons.count({ where: { user_id: userId } });

    const c = condition.toLowerCase();

    // 🔹 Lessons
    if (c.includes("lesson")) {
        const num = parseInt(c, 10);
        return completedLessons >= num;
    }

    // 🔹 Streak
    if (c.includes("streak")) {
        const num = parseInt(c, 10);
        return (stats.streak || 0) >= num;
    }

    // 🔹 XP
    if (c.includes("xp")) {
        const num = parseInt(c, 10);
        return (stats.xp || 0) >= num;
    }

    // 🔹 Practice
    if (c.includes("practice")) {
        const num = parseInt(c, 10);
        return practiceCount >= num;
    }

    // 🔹 Correct answers
    if (c.includes("correct")) {
        const num = parseInt(c, 10);
        return correctAnswers >= num;
    }

    // 🔹 First correct
    if (c.includes("1st correct") || c.includes("first correct")) {
        return correctAnswers > 0;
    }

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
            if (shouldUnlock) {
                await unlock(userId, ach.id);
            }
        }
    }
}

// ✅ API: Return all with unlock status
const getUserAchievements = async (req, res) => {
    try {
        const userId = req.user.id;

        await checkAchievements(userId); // refresh unlocks

        const all = await prisma.achievements.findMany();
        const unlocked = await prisma.user_achievements.findMany({
            where: { user_id: userId },
        });

        const unlockedIds = new Set(unlocked.map((u) => u.achievement_id));

        const merged = all.map((a) => ({
            ...a,
            unlocked: unlockedIds.has(a.id),
            unlocked_at: unlocked.find((u) => u.achievement_id === a.id)?.unlocked_at || null,
        }));

        return res.json({
            status: true,
            message: "All achievements fetched",
            data: merged,
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

module.exports = {
    checkAchievements,
    getUserAchievements,
};
