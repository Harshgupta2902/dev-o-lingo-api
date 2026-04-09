const prisma = require("../prismaClient");
const { notifyUser } = require("../services/notify");

async function unlock(userId, achievementId) {
    const ach = await prisma.achievements.findUnique({ where: { id: achievementId } });

    const result = await prisma.user_achievements.upsert({
        where: { user_id_achievement_id: { user_id: userId, achievement_id: achievementId } },
        update: {},
        create: { user_id: userId, achievement_id: achievementId, unlocked_at: new Date() },
    });

    // Trigger Notification
    if (ach) {
        notifyUser(
            userId,
            "Achievement Unlocked!",
            `Congratulations! You've unlocked the "${ach.title}" achievement.`,
            "achievement",
            { achievementId: ach.id }
        ).catch(err => console.error("Achievement notification error:", err));
    }

    return result;
}

async function evaluateCondition(userId, condition, commonData) {
    const { stats, practiceCount, correctAnswers, completedLessons } = commonData;
    const c = (condition || "").toLowerCase();

    if (c.includes("lesson")) return completedLessons >= (parseInt(c.match(/\d+/)?.[0], 10) || 0);
    if (c.includes("streak")) return (stats.streak || 0) >= (parseInt(c.match(/\d+/)?.[0], 10) || 0);
    if (c.includes("xp")) return (stats.xp || 0) >= (parseInt(c.match(/\d+/)?.[0], 10) || 0);
    if (c.includes("practice")) return practiceCount >= (parseInt(c.match(/\d+/)?.[0], 10) || 0);
    if (c.includes("correct")) return correctAnswers >= (parseInt(c.match(/\d+/)?.[0], 10) || 0);
    if (c.includes("1st correct") || c.includes("first correct")) return correctAnswers > 0;

    return false;
}

async function checkAchievements(userId) {
    // 1. Pre-fetch all data needed for evaluation ONCE
    const [stats, practiceCount, correctAnswers, completedLessons] = await Promise.all([
        prisma.user_stats.findUnique({ where: { user_id: userId } }).then(s => s || {}),
        prisma.daily_practice.count({ where: { user_id: userId, status: "completed" } }),
        prisma.practice_item.count({ where: { daily_practice: { user_id: userId }, is_correct: true } }),
        prisma.user_completed_lessons.count({ where: { user_id: userId } }),
    ]);

    const commonData = { stats, practiceCount, correctAnswers, completedLessons };

    // 2. Get achievements and user progress
    const allAchievements = await prisma.achievements.findMany();
    const unlocked = await prisma.user_achievements.findMany({
        where: { user_id: userId },
        select: { achievement_id: true },
    });
    const unlockedIds = new Set(unlocked.map((u) => u.achievement_id));

    // 3. Evaluate and unlock in parallel
    const unlockPromises = [];
    for (const ach of allAchievements) {
        if (!unlockedIds.has(ach.id)) {
            const shouldUnlock = await evaluateCondition(userId, ach.conditions, commonData);
            if (shouldUnlock) {
                unlockPromises.push(unlock(userId, ach.id));
            }
        }
    }

    if (unlockPromises.length > 0) {
        await Promise.all(unlockPromises);
    }
}


const getAchievements = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // 1. Evaluate new achievements for the user
        await checkAchievements(userId);

        // 2. Fetch all possible achievements
        const all = await prisma.achievements.findMany({
            orderBy: { id: 'asc' }
        });

        // 3. Fetch user's unlocked status
        const unlocked = await prisma.user_achievements.findMany({ 
            where: { user_id: userId } 
        });

        // 4. Create a lookup for performance
        const unlockedMap = new Map(unlocked.map((u) => [u.achievement_id, u.unlocked_at]));

        // 5. Merge and return
        const data = all.map((a) => ({
            ...a,
            unlocked: unlockedMap.has(a.id),
            unlocked_at: unlockedMap.get(a.id) || null,
        }));

        return res.json({ 
            status: true, 
            message: "Achievements fetched successfully", 
            data 
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

module.exports = {
    checkAchievements,
    getAchievements,
};
