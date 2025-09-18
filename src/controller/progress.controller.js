const prisma = require("../prismaClient");
const { checkStreakMilestone } = require("./achievement.controller");

// helper: read settings into a map
async function getSettings() {
    const rows = await prisma.game_settings.findMany();
    const map = {};
    for (const r of rows) map[r.key] = r.value;

    return {
        starting_gems: parseInt(map.starting_gems ?? "100", 10),
        starting_hearts: parseInt(map.starting_hearts ?? "5", 10),
        max_hearts: parseInt(map.max_hearts ?? "5", 10),
        heart_refill_time: parseInt(map.heart_refill_time ?? "15", 10), // minutes
        xp_per_lesson: parseInt(map.xp_per_lesson ?? "10", 10),
        streak_bonus: parseInt(map.streak_bonus ?? "5", 10),

        // 👇 नए keys
        hearts_per_ad_watch: parseInt(map.hearts_per_ad_watch ?? "1", 10),
        gems_per_ad_watch: parseInt(map.gems_per_ad_watch ?? "20", 10),
        enable_ads: parseInt(map.enable_ads ?? "1", 10),
    };
}


// helper: ensure user_stats exists and apply heart auto-refill
async function ensureStatsWithRefill(userId) {
    const s = await getSettings();

    // ensure stats exist
    let stats = await prisma.user_stats.findUnique({ where: { user_id: userId } });
    if (!stats) {
        stats = await prisma.user_stats.create({
            data: {
                user_id: userId,
                xp: 0,
                streak: 0,
                gems: s.starting_gems,
                hearts: s.starting_hearts,
                last_heart_update: new Date(),
            }
        });
    }

    // try lazy heart refill (works even if you don't have last_heart_update yet)
    const now = new Date();
    const lastUpdate = stats.last_heart_update ? new Date(stats.last_heart_update) : now;
    const minutesPassed = Math.floor((now - lastUpdate) / 60000);

    let newHearts = stats.hearts ?? 0;
    let needsUpdate = false;

    if (newHearts < s.max_hearts && minutesPassed >= s.heart_refill_time) {
        const toAdd = Math.floor(minutesPassed / s.heart_refill_time);
        newHearts = Math.min(s.max_hearts, newHearts + toAdd);
        needsUpdate = true;
    }

    if (!stats.last_heart_update) needsUpdate = true;

    if (needsUpdate) {
        stats = await prisma.user_stats.update({
            where: { user_id: userId },
            data: {
                hearts: newHearts,
                last_heart_update: now,
                updated_at: now
            }
        });
    }

    return stats;
}

async function ensureProgress(userId) {
    let progress = await prisma.user_progress.findUnique({ where: { user_id: userId } })
        .catch(() => null);

    if (!progress) {
        // get learningLanguage from onboarding
        const lastResponse = await prisma.onboarding_responses.findFirst({
            where: { user_id: userId },
            orderBy: { created_at: "desc" },
            include: {
                onboarding_answers: {
                    where: { question_key: "learningLanguage" },
                    select: { answer_value: true }
                }
            }
        });

        const learningLang = lastResponse?.onboarding_answers[0]?.answer_value || "";

        progress = await prisma.user_progress.create({
            data: {
                user_id: userId,
                lang: learningLang,
                last_completed_lesson_id: null
            }
        });
    }

    return progress;
}

const checkStreak = async (req, res) => {
    try {
        const userId = req.user.id;

        const stats = await ensureStatsWithRefill(userId);
        const progress = await ensureProgress(userId);

        const lastLessonDate = progress.updated_at ? new Date(progress.updated_at) : null;
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        let streak = stats.streak || 0;

        // Only increment if we haven't updated streak today
        const alreadyUpdatedToday =
            stats.last_streak_date &&
            new Date(stats.last_streak_date).toDateString() === today.toDateString();

        if (!alreadyUpdatedToday && lastLessonDate) {
            if (
                lastLessonDate.toDateString() === today.toDateString() ||
                lastLessonDate.toDateString() === yesterday.toDateString()
            ) {
                streak += 1;
            } else {
                streak = 0;
            }
        }

        const updatedStats = await prisma.user_stats.update({
            where: { user_id: userId },
            data: {
                streak,
                last_streak_date: today,
                updated_at: today
            }
        });
        await checkStreakMilestone(userId);


        return res.json({
            status: true,
            message: "Streak checked",
            data: { streak: updatedStats.streak }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

const getUserStats = async (req, res) => {
    try {
        const userId = req.user.id;

        const stats = await ensureStatsWithRefill(userId);

        return res.json({
            status: true,
            message: "User Stats Fetched",
            data: stats
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};


module.exports = { ensureStatsWithRefill, ensureProgress, checkStreak, getUserStats, getSettings };
