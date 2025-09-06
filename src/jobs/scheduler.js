// jobs/scheduler.js
const cron = require('node-cron');
const { sendPracticeReminders, sendStreakBreakWarnings } = require('./dailyReminders');
const { sendWeeklySummaryEmails } = require('./weeklySummary');

// ⏰ Daily practice reminder at 7:00 PM IST
cron.schedule('0 19 * * *', async () => {
  const r = await sendPracticeReminders();
  console.log('[Cron] practice reminders sent:', r.count);
});

// ⏰ Streak warning at 9:00 PM IST
cron.schedule('0 21 * * *', async () => {
  const r = await sendStreakBreakWarnings();
  console.log('[Cron] streak warnings sent:', r.count);
});

// ⏰ Weekly summary every Monday 9:00 AM IST
// cron.schedule('0 9 * * 1', async () => {
//   const r = await sendWeeklySummaryEmails();
//   console.log('[Cron] weekly summaries sent:', r.sent);
// });

module.exports = {};
