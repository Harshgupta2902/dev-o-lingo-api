// jobs/scheduler.js
const cron = require('node-cron');
const { 
  sendPracticeReminders, 
  sendStreakBreakWarnings, 
  sendStreakCountdownReminders,
  sendReengagementReminders 
} = require('./dailyReminders');
const { sendWeeklySummaryEmails } = require('./weeklySummary');

// ⏰ Daily re-engagement check at 12:00 PM IST
cron.schedule('0 12 * * *', async () => {
  const r = await sendReengagementReminders();
  console.log('[Cron] re-engagement messages sent:', r.count);
});

// ⏰ Hourly streak countdown (checking if 1-6 hours left)
cron.schedule('0 * * * *', async () => {
  const r = await sendStreakCountdownReminders();
  if (r.count > 0) {
    console.log(`[Cron] streak countdown notifications sent (${r.hoursLeft}h left):`, r.count);
  }
});

// ⏰ Morning practice reminder at 8:00 AM IST
cron.schedule('0 8 * * *', async () => {
  const r = await sendPracticeReminders();
  console.log('[Cron] morning practice reminders sent:', r.count);
});

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
