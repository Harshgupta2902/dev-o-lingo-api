const prisma = require("../prismaClient");
const dayjs = require("dayjs");
const isoWeek = require("dayjs/plugin/isoWeek");
dayjs.extend(isoWeek);

/* ---------- helpers ---------- */
function getWeekYear(d = dayjs()) {
  return `${d.year()}-W${d.isoWeek()}`; // e.g. 2025-W36
}
function weekRangeNow() {
  const start = dayjs().startOf("isoWeek");
  const end   = dayjs().endOf("isoWeek");
  return { start: start.toDate(), end: end.toDate() };
}
function monthRangeNow() {
  const start = dayjs().startOf("month");
  const end   = dayjs().endOf("month");
  return { start: start.toDate(), end: end.toDate() };
}
/** all week_year strings (YYYY-W##) that overlap with the current month */
function weekYearsOfThisMonth() {
  const start = dayjs().startOf("month");
  const end   = dayjs().endOf("month");
  const set = new Set();
  // step by 1 day is safest (handles short/long iso weeks neatly)
  for (let d = start; !d.isAfter(end, "day"); d = d.add(1, "day")) {
    set.add(getWeekYear(d));
  }
  return [...set];
}

/* ---------- API ---------- */
const getLeaderboard = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "10", 10), 100);

    /* ===================== WEEKLY ===================== */
    const weekYear = getWeekYear();
    const { start: wStart, end: wEnd } = weekRangeNow();

    // 1) Weekly XP from leaderboards (already aggregated per week)
    const weekRows = await prisma.leaderboards.findMany({
      where: { week_year: weekYear },
      select: { user_id: true, xp: true },
    });
    const weeklyMap = new Map(); // user_id -> xp
    for (const r of weekRows) {
      weeklyMap.set(r.user_id, (weeklyMap.get(r.user_id) || 0) + (r.xp || 0));
    }

    // 2) Weekly XP from daily_practice (completed this iso week)
    const weekDP = await prisma.daily_practice.groupBy({
      by: ["user_id"],
      where: { status: "completed", date: { gte: wStart, lte: wEnd } },
      _sum: { earned_xp: true },
    });
    for (const g of weekDP) {
      weeklyMap.set(
        g.user_id,
        (weeklyMap.get(g.user_id) || 0) + (g._sum.earned_xp || 0)
      );
    }

    // 3) Sort + top N + user info
    const weeklyPairs = [...weeklyMap.entries()]
      .map(([userId, xp]) => ({ userId, xp: Number(xp) || 0 }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, limit);

    const weeklyIds = weeklyPairs.map((x) => x.userId);
    const weeklyUsers = weeklyIds.length
      ? await prisma.users.findMany({
          where: { id: { in: weeklyIds } },
          select: { id: true, name: true, profile: true },
        })
      : [];
    const wUserMap = new Map(weeklyUsers.map((u) => [u.id, u]));

    const weekly = weeklyPairs.map((x, i) => ({
      rank: i + 1,
      userId: x.userId,
      name: wUserMap.get(x.userId)?.name || "Unknown",
      avatar: wUserMap.get(x.userId)?.profile || "",
      xp: x.xp,
    }));

    /* ===================== MONTHLY ===================== */
    const { start: mStart, end: mEnd } = monthRangeNow();

    // 1) Collect all week_years inside this month
    const monthWeeks = weekYearsOfThisMonth();

    // 2) Monthly portion from leaderboards = sum of those weekly rows
    const monthLRows = monthWeeks.length
      ? await prisma.leaderboards.findMany({
          where: { week_year: { in: monthWeeks } },
          select: { user_id: true, xp: true },
        })
      : [];
    const monthlyMap = new Map(); // user_id -> xp
    for (const r of monthLRows) {
      monthlyMap.set(r.user_id, (monthlyMap.get(r.user_id) || 0) + (r.xp || 0));
    }

    // 3) Monthly XP from daily_practice in the calendar month
    const monthDP = await prisma.daily_practice.groupBy({
      by: ["user_id"],
      where: { status: "completed", date: { gte: mStart, lte: mEnd } },
      _sum: { earned_xp: true },
    });
    for (const g of monthDP) {
      monthlyMap.set(
        g.user_id,
        (monthlyMap.get(g.user_id) || 0) + (g._sum.earned_xp || 0)
      );
    }

    // 4) Sort + top N + user info
    const monthlyPairs = [...monthlyMap.entries()]
      .map(([userId, xp]) => ({ userId, xp: Number(xp) || 0 }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, limit);

    const monthlyIds = monthlyPairs.map((x) => x.userId);
    const monthlyUsers = monthlyIds.length
      ? await prisma.users.findMany({
          where: { id: { in: monthlyIds } },
          select: { id: true, name: true, profile: true },
        })
      : [];
    const mUserMap = new Map(monthlyUsers.map((u) => [u.id, u]));

    const monthly = monthlyPairs.map((x, i) => ({
      rank: i + 1,
      userId: x.userId,
      name: mUserMap.get(x.userId)?.name || "Unknown",
      avatar: mUserMap.get(x.userId)?.profile || "",
      xp: x.xp,
    }));

    /* ---------- response ---------- */
    return res.json({
      status: true,
      message: "Leaderboard fetched",
      data: { weekly, monthly },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: false, message: err.message });
  }
};


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



module.exports = { updateLeaderboard, getLeaderboard };
