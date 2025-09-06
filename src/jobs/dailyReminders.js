// jobs/dailyReminders.js
const dayjs = require('dayjs');
const prisma = require('../prismaClient');
const { sendPushToUser } = require('../services/notify');

const todayKey = () => dayjs().format('YYYY-MM-DD');

async function usersNeedingPracticeReminder() {
  const date = new Date(todayKey());
  // Users who DON'T have a completed practice today
  const practices = await prisma.daily_practice.findMany({
    where: { date, status: 'completed' },
    select: { user_id: true },
  });
  const doneSet = new Set(practices.map(p => p.user_id));

  // Active users = have stats row (or you can widen this)
  const users = await prisma.user_stats.findMany({ select: { user_id: true } });
  return users.map(u => u.user_id).filter(id => !doneSet.has(id));
}

async function usersAtRiskStreakBreak() {
  const date = new Date(todayKey());
  const completed = await prisma.daily_practice.findMany({
    where: { date, status: 'completed' },
    select: { user_id: true },
  });
  const done = new Set(completed.map(p => p.user_id));

  const stats = await prisma.user_stats.findMany({
    where: { streak: { gt: 0 } },
    select: { user_id: true, last_streak_date: true, streak: true },
  });

  // If not completed today, streak > 0 => warn
  return stats
    .filter(s => !done.has(s.user_id))
    .map(s => s.user_id);
}

async function sendPracticeReminders() {
  const userIds = await usersNeedingPracticeReminder();
  const title = "Time for today’s practice!";
  const body  = "Keep your learning on track—finish your daily practice now.";
  await Promise.all(userIds.map(id => sendPushToUser(id, title, body, { type: 'practice_reminder' })));
  return { count: userIds.length };
}

async function sendStreakBreakWarnings() {
  const userIds = await usersAtRiskStreakBreak();
  const title = "Your streak is at risk!";
  const body  = "Do today’s practice to keep your streak alive 🔥";
  await Promise.all(userIds.map(id => sendPushToUser(id, title, body, { type: 'streak_warning' })));
  return { count: userIds.length };
}

module.exports = { sendPracticeReminders, sendStreakBreakWarnings };
