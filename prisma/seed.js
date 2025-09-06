const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const achievements = [];

  let id = 1;

  // 1. Lessons Completed
  const lessonMilestones = [1, 5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
  for (const count of lessonMilestones) {
    achievements.push({
      id: id++,
      title: `Lesson Master ${count}`,
      description: `Complete ${count} lessons`,
      conditions: `${count} lessons completed`,
    });
  }

  // 2. Streak Days
  const streakMilestones = [1, 3, 7, 10, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365];
  for (const days of streakMilestones) {
    achievements.push({
      id: id++,
      title: `Streak ${days}`,
      description: `Maintain a ${days}-day streak`,
      conditions: `${days}-day streak`,
    });
  }

  // 3. XP Earned
  const xpMilestones = [100, 500, 1000, 2000, 5000, 10000, 20000, 30000, 50000, 75000, 100000, 200000, 300000, 500000, 750000, 1000000];
  for (const xp of xpMilestones) {
    achievements.push({
      id: id++,
      title: `XP Hunter ${xp}`,
      description: `Earn ${xp} XP`,
      conditions: `${xp} total XP`,
    });
  }

  // 4. Practice Sessions
  const practiceMilestones = [1, 5, 10, 20, 30, 50, 75, 100, 150, 200, 300, 400, 500];
  for (const count of practiceMilestones) {
    achievements.push({
      id: id++,
      title: `Practice Champ ${count}`,
      description: `Complete ${count} practice sessions`,
      conditions: `${count} practices completed`,
    });
  }

  // 5. Correct Answers
  const correctMilestones = [1, 10, 50, 100, 200, 300, 500, 750, 1000, 2000, 3000, 5000, 7500, 10000];
  for (const count of correctMilestones) {
    achievements.push({
      id: id++,
      title: `Sharp Mind ${count}`,
      description: `Answer ${count} questions correctly`,
      conditions: `${count} correct answers`,
    });
  }

  // 6. Special Unlocks (fun badges)
  const specialBadges = [
    ["First Win", "Answer your first question correctly", "1st correct answer"],
    ["Early Bird", "Complete a lesson before 7AM", "lesson before 7AM"],
    ["Night Owl", "Complete a lesson after 11PM", "lesson after 11PM"],
    ["Consistency King", "Practice for 30 days without break", "30-day no-break"],
    ["Gem Collector", "Earn 1000 gems", "1000 gems"],
    ["Iron Will", "Finish a lesson with 0 hearts", "lesson with 0 hearts"],
    ["Perfectionist", "Score 100% in a lesson", "100% accuracy"],
    ["Speed Runner", "Finish lesson in under 1 min", "lesson <1min"],
    ["Slow and Steady", "Spend over 10 min on lesson", "lesson >10min"],
    ["Social Learner", "Invite a friend", "referral"],
    ["Team Player", "Join leaderboard top 10", "top10 leaderboard"],
    ["Champion", "Rank #1 in leaderboard", "rank1 leaderboard"],
    ["Veteran", "1 year of learning", "365 days active"],
    ["Comeback Kid", "Return after 30 days break", "return after 30 days"],
    ["Collector", "Unlock 50 achievements", "50 achievements unlocked"],
  ];

  for (const [title, description, conditions] of specialBadges) {
    achievements.push({
      id: id++,
      title,
      description,
      conditions,
    });
  }

  // ✅ Insert into DB
  await prisma.achievements.createMany({
    data: achievements,
    skipDuplicates: true,
  });

  console.log(`✅ Seeded ${achievements.length} achievements successfully`);
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
