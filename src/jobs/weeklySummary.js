// jobs/weeklySummary.js
const dayjs = require('dayjs');
const prisma = require('../prismaClient');
const { sendEmail } = require('../services/notify');

async function buildWeeklyStatsForUser(userId, since, until) {
  // XP from daily practice
  const practices = await prisma.daily_practice.findMany({
    where: {
      user_id: userId,
      completed_at: { gte: since.toDate(), lte: until.toDate() },
      status: 'completed',
    },
    select: { earned_xp: true, earned_gems: true },
  });

  const xp = practices.reduce((s, p) => s + (p.earned_xp || 0), 0);

  // Lessons completed
  const lessons = await prisma.user_completed_lessons.count({
    where: {
      user_id: userId,
      completed_at: { gte: since.toDate(), lte: until.toDate() },
    },
  });

  return { xp, lessons };
}

async function sendWeeklySummaryEmails() {
  const until = dayjs().endOf('day');
  const since = until.subtract(7, 'day').startOf('day');

  // Users with email + any activity (stats row)
  const users = await prisma.users.findMany({
    where: { email: { not: null } },
    select: { id: true, name: true, email: true },
  });

  let sent = 0;
  for (const u of users) {
    const { xp, lessons } = await buildWeeklyStatsForUser(u.id, since, until);
    if (xp === 0 && lessons === 0) continue; // skip inactive

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto">
        <h2>Weekly Summary</h2>
        <p>Hi ${u.name || 'Learner'}, here’s your progress for the week (${since.format('DD MMM')} – ${until.format('DD MMM')}):</p>
        <ul>
          <li><b>XP gained:</b> ${xp}</li>
          <li><b>Lessons completed:</b> ${lessons}</li>
        </ul>
        <p>Keep up the streak 🔥</p>
      </div>
    `;
    await sendEmail(u.email, 'Your Weekly Learning Summary', html);
    sent++;
  }

  return { sent };
}

module.exports = { sendWeeklySummaryEmails };
