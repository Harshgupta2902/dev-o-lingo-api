// jobs/dailyReminders.js
const dayjs = require('dayjs');
const prisma = require('../prismaClient');
const { notifyUser } = require('../services/notify');

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
  const title = "Daily practice available! 📚";
  const body  = "Start your day with a quick practice and keep your momentum going.";
  await Promise.all(userIds.map(id => notifyUser(id, title, body, 'practice_reminder')));
  return { count: userIds.length };
}

async function sendStreakBreakWarnings() {
  const userIds = await usersAtRiskStreakBreak();
  const title = "Your streak is at risk!";
  const body  = "Do today’s practice to keep your streak alive 🔥";
  await Promise.all(userIds.map(id => notifyUser(id, title, body, 'streak_warning')));
  return { count: userIds.length };
}

async function sendStreakCountdownReminders() {
  const now = dayjs();
  const endOfDay = now.endOf('day');
  const hoursLeft = Math.ceil(endOfDay.diff(now, 'hour', true));

  // Only notify when less than 4 hours left
  if (hoursLeft < 1 || hoursLeft >= 4) {
    return { count: 0, reason: 'outside_window', hoursLeft };
  }

  const potentialUserIds = await usersAtRiskStreakBreak();
  if (potentialUserIds.length === 0) return { count: 0, hoursLeft };

  // Filter out users who already received a 'streak_countdown' today
  const startOfToday = now.startOf('day').toDate();
  const alreadyNotified = await prisma.notifications.findMany({
    where: {
      type: 'streak_countdown',
      created_at: { gte: startOfToday },
      user_id: { in: potentialUserIds }
    },
    select: { user_id: true }
  });

  const alreadyNotifiedIds = new Set(alreadyNotified.map(n => n.user_id));
  const userIdsToNotify = potentialUserIds.filter(id => !alreadyNotifiedIds.has(id));

  if (userIdsToNotify.length === 0) return { count: 0, hoursLeft };

  const title = "Streak ending soon! 🔥";
  const body = `Your streak ends in ${hoursLeft} ${hoursLeft === 1 ? 'hour' : 'hours'}. Complete your practice now!`;

  await Promise.all(userIdsToNotify.map(id => notifyUser(id, title, body, 'streak_countdown', { 
    hours_left: hoursLeft
  })));

  return { count: userIdsToNotify.length, hoursLeft };
}

async function sendReengagementReminders() {
  const now = dayjs();
  
  // Get all users with stats and their last re-engagement notification
  const users = await prisma.users.findMany({
    include: {
      user_stats: true,
      notifications: {
        where: { type: 'reengagement' },
        orderBy: { created_at: 'desc' },
        take: 1
      }
    }
  });

  let sentCount = 0;

  for (const user of users) {
    if (!user.user_stats) continue;

    const lastActive = dayjs(user.user_stats.updated_at);
    const hoursInactive = now.diff(lastActive, 'hour');
    const daysInactive = now.diff(lastActive, 'day');
    
    const lastNotif = user.notifications[0];
    const hoursSinceNotif = lastNotif ? now.diff(dayjs(lastNotif.created_at), 'hour') : 999999;
    const daysSinceNotif = lastNotif ? now.diff(dayjs(lastNotif.created_at), 'day') : 999999;

    let title = "";
    let body = "";

    // Buckets: 20h, 7d, 14d, 21d, 28d, 60d, 90d...
    if (daysInactive >= 90 && daysSinceNotif >= 28) {
      title = "It's been 3 months! 🌟";
      body = `Welcome back, ${user.name}! We've missed you. Come see what's new!`;
    } else if (daysInactive >= 60 && daysSinceNotif >= 28) {
      title = "Two months away? 🕰️";
      body = `Time flies, ${user.name}! Pick up where you left off today.`;
    } else if (daysInactive >= 28 && daysSinceNotif >= 6) {
      title = "One month milestone! 🏗️";
      body = `It's been a month, ${user.name}. Don't let your skills get rusty!`;
    } else if (daysInactive >= 21 && daysSinceNotif >= 6) {
      title = "3 weeks already? 🔍";
      body = `Hey ${user.name}, your learning journey is waiting for you!`;
    } else if (daysInactive >= 14 && daysSinceNotif >= 6) {
      title = "2 weeks break? 🐣";
      body = `Welcome back, ${user.name}! A quick practice will keep your momentum.`;
    } else if (daysInactive >= 7 && daysSinceNotif >= 6) {
      title = "A week has passed! 📅";
      body = `It's been a week, ${user.name}. Ready for some daily practice?`;
    } else if (hoursInactive >= 20 && !lastNotif && hoursInactive < 48) {
      title = "We miss you! ❤️";
      body = `Hey ${user.name}, it's been a while. Ready for a quick practice?`;
    }

    if (title) {
      await notifyUser(user.id, title, body, 'reengagement');
      sentCount++;
    }
  }

  return { count: sentCount };
}

module.exports = { 
  sendPracticeReminders, 
  sendStreakBreakWarnings, 
  sendStreakCountdownReminders,
  sendReengagementReminders 
};
