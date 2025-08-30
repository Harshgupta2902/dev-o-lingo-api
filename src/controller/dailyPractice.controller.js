const prisma = require("../prismaClient");

const assignPractice = async (req, res) => {
    try {
        const userId = req.user.id;

        // check if already assigned today
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10); // YYYY-MM-DD

        let practice = await prisma.daily_practice.findFirst({
            where: { user_id: userId, date: new Date(dateStr) },
            include: { items: { include: { question: true } } }
        });

        if (practice) {
            return res.json({ status: true, message: "Already assigned", data: practice });
        }

        // get user's language from onboarding/progress
        const progress = await prisma.user_progress.findUnique({ where: { user_id: userId } });
        if (!progress) return res.status(400).json({ status: false, message: "User progress not found" });


        const questionsToBeAssigned = await prisma.game_settings.findUnique({ where: { key: "daily_practice_size" } });

        // fetch questions of this language, excluding already used
        const usedQuestions = await prisma.practice_item.findMany({
            where: { daily_practice: { user_id: userId } },
            select: { question_id: true }
        });

        const excludeIds = usedQuestions.map(q => q.question_id);

        const questions = await prisma.questions.findMany({
            where: {
                language_id: progress.language_id,
                id: { notIn: excludeIds }
            },
            take: questionsToBeAssigned.value ?? 10
        });

        if (questions.length === 0) {
            return res.json({ status: false, message: "No new questions available" });
        }

        // create practice with items
        practice = await prisma.daily_practice.create({
            data: {
                user_id: userId,
                date: new Date(dateStr),
                status: "assigned",
                items: {
                    create: questions.map(q => ({
                        question_id: q.id,
                        question_status: "pending"
                    }))
                }
            },
            include: { items: { include: { question: true } } }
        });

        return res.json({ status: true, message: "Practice assigned", data: practice });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

// 🔑 Get today's practice (auto assign if not exists)
const getTodayPractice = async (req, res) => {
    try {
        const userId = req.user.id;
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10);

        let practice = await prisma.daily_practice.findFirst({
            where: { user_id: userId, date: new Date(dateStr) },
            include: { items: { include: { question: true } } }
        });

        if (!practice || practice.status === "completed") {
            return assignPractice(req, res);
        }

        return res.json({ status: true, message: "Fetched today's practice", data: practice });

    } catch (err) {
        return res.status(500).json({ status: false, message: err.message });
    }
};

// 🔑 Submit all answers
const submitPractice = async (req, res) => {
    try {
        const userId = req.user.id;
        const { practiceId, answers } = req.body;

        const practice = await prisma.daily_practice.findUnique({
            where: { id: practiceId },
            include: { items: true }
        });

        if (!practice || practice.user_id !== userId) {
            return res.status(404).json({ status: false, message: "Practice not found" });
        }

        if( practice.status === "completed") {
            return res.status(400).json({ status: false, message: "Practice already submitted" });
        }

        let correct = 0, wrong = 0, skipped = 0;

        for (const item of practice.items) {
            const ans = answers[item.question_id];
            if (!ans) continue;

            if (ans.status === "skipped") {
                skipped++;
                await prisma.practice_item.update({
                    where: { id: item.id },
                    data: { question_status: "skipped" }
                });
            } else if (ans.status === "answered") {
                const q = await prisma.questions.findUnique({ where: { id: item.question_id } });
                const isCorrect = q.answer === ans.answer;
                if (isCorrect) correct++;
                else wrong++;

                await prisma.practice_item.update({
                    where: { id: item.id },
                    data: {
                        question_status: "answered",
                        user_answer: ans.answer,
                        is_correct: isCorrect
                    }
                });
            }
        }

        // ✅ Fetch reward settings
        const settings = await prisma.game_settings.findMany({
            where: { key: { in: ["practice_full_xp", "practice_full_gems"] } }
        });
        const settingMap = {};
        settings.forEach(s => (settingMap[s.key] = parseInt(s.value)));

        const total = correct + wrong + skipped;
        let earnedXp = 0,
            earnedGems = 0;

        if (wrong === 0 && skipped === 0) {
            earnedXp = settingMap.practice_full_xp || 30;
            earnedGems = settingMap.practice_full_gems || 50;
        } else {
            const fullXp = settingMap.practice_full_xp || 30;
            const fullGems = settingMap.practice_full_gems || 50;

            earnedXp = Math.floor((fullXp / total) * correct);
            earnedGems = Math.floor((fullGems / total) * correct);
        }

        // ✅ Update user stats
        let stats = await prisma.user_stats.findUnique({ where: { user_id: userId } });
        if (!stats) {
            stats = await prisma.user_stats.create({
                data: {
                    user_id: userId,
                    xp: 0,
                    streak: 0,
                    gems: 0,
                    hearts: 5
                }
            });
        }

        const updatedStats = await prisma.user_stats.update({
            where: { user_id: userId },
            data: {
                xp: { increment: earnedXp },
                gems: { increment: earnedGems },
                updated_at: new Date()
            }
        });

        await prisma.daily_practice.update({
            where: { id: practiceId },
            data: {
                status: "completed", 
                completed_at: new Date(),
                earned_xp: earnedXp,
                earned_gems: earnedGems
            }
        });

        return res.json({
            status: true,
            message: "Practice submitted",
            data: {
                correct,
                wrong,
                skipped,
                total,
                earnedXp,
                earnedGems,
                totalXp: updatedStats.xp,
                totalGems: updatedStats.gems
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};


// 🔑 History
const getPracticeHistory = async (req, res) => {
    try {
        const userId = req.user.id;

        const history = await prisma.daily_practice.findMany({
            where: { user_id: userId },
            orderBy: { date: "desc" },
            include: {
                items: {
                    select: {
                        question_status: true,
                        is_correct: true
                    }
                }
            }
        });

        // calculate stats per session
        const formatted = history.map(practice => {
            const total = practice.items.length;
            const answered = practice.items.filter(i => i.question_status === "answered").length;
            const skipped = practice.items.filter(i => i.question_status === "skipped").length;
            const correct = practice.items.filter(i => i.is_correct === true).length;
            const wrong = answered - correct;

            return {
                id: practice.id,
                date: practice.date,
                status: practice.status,
                completed_at: practice.completed_at,
                earned_xp: practice.earned_xp || 0,      
                earned_gems: practice.earned_gems || 0,  
                score: `${correct}/${total}`,
                summary: {
                    total,
                    answered,
                    correct,
                    wrong,
                    skipped
                }
            };
        });

        return res.json({
            status: true,
            message: "Fetched practice history",
            data: formatted
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};


module.exports = {
    getTodayPractice,
    submitPractice,
    getPracticeHistory
,
assignPractice
};
