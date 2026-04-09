const prisma = require("../prismaClient");

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

        hearts_per_ad_watch: parseInt(map.hearts_per_ad_watch ?? "1", 10),
        gems_per_ad_watch: parseInt(map.gems_per_ad_watch ?? "20", 10),
        enable_ads: parseInt(map.enable_ads ?? "1", 10),
    };
}


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

        progress = await prisma.user_progress.upsert({
            where: { user_id: userId },
            update: {
                lang: learningLang
            },
            create: {
                user_id: userId,
                lang: learningLang,
                last_completed_lesson_id: null
            }
        });
    }

    return progress;
}

const LEVELS = [
    { level: 1, title: 'Beginner', min_xp: 0, max_xp: 250, emoji: '🐣' },
    { level: 2, title: 'Explorer', min_xp: 251, max_xp: 750, emoji: '🔍' },
    { level: 3, title: 'Builder', min_xp: 751, max_xp: 1500, emoji: '🔨' },
    { level: 4, title: 'Developer', min_xp: 1501, max_xp: 3000, emoji: '💻' },
    { level: 5, title: 'Advanced Developer', min_xp: 3001, max_xp: 5500, emoji: '🚀' },
    { level: 6, title: 'Expert', min_xp: 5501, max_xp: 9000, emoji: '🧠' },
    { level: 7, title: 'Specialist', min_xp: 9001, max_xp: 14000, emoji: '🏗' },
    { level: 8, title: 'Architect', min_xp: 14001, max_xp: 21000, emoji: '💎' },
    { level: 9, title: 'Innovator', min_xp: 21001, max_xp: 32000, emoji: '👑' },
    { level: 10, title: 'Legend', min_xp: 32001, max_xp: null, emoji: '🔥' },
];

function getLevelForXp(xp = 0) {
    const current = [...LEVELS].reverse().find(l => xp >= l.min_xp) || LEVELS[0];
    const next = LEVELS.find(l => l.level === current.level + 1) || null;
    return {
        rank: current.level,
        title: current.title,
        emoji: current.emoji,
        next_level_xp: next ? next.min_xp : null,
        xp_to_next: next ? Math.max(0, next.min_xp - xp) : 0,
    };
}

const getUserStats = async (req, res) => {
    try {
        const userId = req.user.id;

        const [stats, unreadNotifications, reviewCount] = await Promise.all([
            ensureStatsWithRefill(userId),
            prisma.notifications.count({
                where: { user_id: userId, is_read: false },
            }),
            prisma.practice_item.count({
                where: {
                    daily_practice: { user_id: userId },
                    OR: [
                        { question_status: "skipped" },
                        { question_status: "answered", is_correct: false },
                    ],
                },
            }),
        ]);

        return res.json({
            status: true,
            message: "User Stats Fetched",
            data: {
                ...stats,
                unreadNotifications,
                level: getLevelForXp(stats.xp || 0),
                showHome: true,
                showDailyPractise: false,
                showLeaderboard: true,
                showPractiseCenter: reviewCount > 0,
                showProfile: true,
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};


module.exports = { ensureStatsWithRefill, ensureProgress, getUserStats, getSettings };
