const prisma = require("../prismaClient");
const dayjs = require("dayjs");
const isoWeek = require("dayjs/plugin/isoWeek");
dayjs.extend(isoWeek);

function getWeekYear() {
    const week = dayjs().isoWeek();
    const year = dayjs().year();
    return `${year}-W${week}`;
}

// ✅ Upsert XP in leaderboard
async function updateLeaderboard(userId, xp) {
    const weekYear = getWeekYear();

    await prisma.leaderboards.upsert({
        where: {
            user_id_week_year: { user_id: userId, week_year: weekYear }
        },
        update: { xp: { increment: xp }, updated_at: new Date() },
        create: { user_id: userId, week_year: weekYear, xp, created_at: new Date() }
    });
}

// ✅ API: Get leaderboard top 10 + user rank
const getLeaderboard = async (req, res) => {
    try {
        const userId = req.user.id;
        const weekYear = getWeekYear();

        // top 10
        const top10 = await prisma.leaderboards.findMany({
            where: { week_year: weekYear },
            orderBy: { xp: "desc" },
            take: 10,
            include: { users: { select: { id: true, name: true, email: true } } }
        });

        // all ranks
        const all = await prisma.leaderboards.findMany({
            where: { week_year: weekYear },
            orderBy: { xp: "desc" },
            select: { user_id: true }
        });

        const userRank = all.findIndex((x) => x.user_id === userId) + 1;

        return res.json({
            status: true,
            message: "Leaderboard fetched",
            data: { top10, userRank }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

module.exports = { updateLeaderboard, getLeaderboard };
