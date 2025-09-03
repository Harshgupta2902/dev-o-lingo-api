const prisma = require('../prismaClient');
const { ensureProgress, ensureStatsWithRefill } = require('./progress.controller');

const getHomeLangauge = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await prisma.users.findUnique({
            where: { email },
            include: {
                onboarding_responses: {
                    orderBy: { created_at: 'desc' },
                    take: 1,
                    include: {
                        onboarding_answers: {
                            where: { question_key: 'learningLanguage' },
                            select: { answer_value: true },
                        },
                    },
                },
            },
        });

        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        const answers = user.onboarding_responses[0]?.onboarding_answers || [];
        const learningLanguage = answers.length > 0 ? answers[0].answer_value : null;


        const language = await prisma.languages.findFirst({
            where: { code: learningLanguage },
            include: {
                units: {
                    orderBy: { sort_order: 'asc' },
                    include: {
                        lessons: {
                            orderBy: { sort_order: 'asc' },
                        },
                    },
                },
            },
        });

        if (!language) {
            return res.status(404).json({ status: false, message: "Language not found in database" });
        }
        // Step 3: Add counts
        const unitsWithLessonCount = language.units.map(unit => ({
            ...unit,
            lessonCount: unit.lessons.length,
            lessons: unit.lessons.map(lesson => ({
                ...lesson,
            })),
        }));

        const progress = await ensureProgress(Number(user.id));
        const stats = await ensureStatsWithRefill(Number(user.id));


        return res.json({
            status: true,
            message: "Fetched language units and lessons",
            data: {
                stats: stats,
                lastCompletedLessonId: Number(progress.last_completed_lesson_id) ?? 0,
                languageId: language.id,
                languageTitle: language.title,
                unitCount: language.units.length,
                units: unitsWithLessonCount,
            },
        });


    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};


const getExercisesbyId = async (req, res) => {
    try {
        const { external_id } = req.body;

        // 1) Exercise fetch
        const exercise = await prisma.exercises.findFirst({
            where: { slug: external_id },
        });

        if (!exercise) {
            return res
                .status(404)
                .json({ status: false, message: "No Exercise Found" });
        }

        // 2) Questions fetch
        const questions = await prisma.questions.findMany({
            where: { map_key: external_id },
            orderBy: { id: "asc" },
        });

        if (!questions.length) {
            return res.json({
                status: true,
                message: "Fetched exercise but no questions found",
                data: { exercise, questions: [], practical_tasks: [] },
            });
        }

        // 3) Practical tasks → ek hi baar nikal lo (maan kar sabhi me same hain)
        const tasks = {
            task1: questions[0].task1,
            task2: questions[0].task2,
        };

        // 4) Questions array se tasks remove karo
        const questionList = questions.map((q) => ({
            id: q.id,
            language_id: q.language_id,
            map_key: q.map_key,
            question: q.question,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c,
            option_d: q.option_d,
            answer: q.answer,
            created_at: q.created_at,
            updated_at: q.updated_at,
        }));

        // 5) Final response
        return res.json({
            status: true,
            message: "Fetched exercise with questions",
            data: {
                exercise,
                questions: questionList,
                practical_tasks: [tasks],
            },
        });
    } catch (err) {
        console.error(err);
        return res
            .status(500)
            .json({ status: false, message: err.message || "Server Error" });
    }
};

const submitLesson = async (req, res) => {
    try {
        const userId = req.user.id;
        const { lessonId, answers, timeTaken } = req.body;

        const lesson = await prisma.lessons.findUnique({
            where: { id: lessonId },
            include: { units: true },
        });

        if (!lesson) {
            return res.status(404).json({ status: false, message: "Lesson not found" });
        }

        const questions = await prisma.questions.findMany({
            where: { map_key: lesson.external_id },
        });

        if (!questions.length) {
            return res.json({
                status: true,
                message: "Lesson has no questions",
                data: { correctCount: 0, wrongCount: 0, earnedXP: 0, earnedGems: 0, heartsLeft: 5, percentage: 0, tagline: "No questions in this lesson" },
            });
        }

        // ✅ Compare answers
        let correctCount = 0;
        let wrongCount = 0;

        questions.forEach((q, idx) => {
            const userAnswer = answers[idx];
            const isCorrect = userAnswer?.trim().toLowerCase() === q.answer.trim().toLowerCase();
            if (isCorrect) correctCount++;
            else wrongCount++;
        });

        const xpPerCorrect = parseInt(
            (await prisma.game_settings.findUnique({ where: { key: "xp_per_correct" } }))
                ?.value || "10"
        );
        const gemsPerCorrect = parseInt(
            (await prisma.game_settings.findUnique({ where: { key: "gems_per_correct" } }))
                ?.value || "1"
        );
        const heartPenalty = parseInt(
            (await prisma.game_settings.findUnique({ where: { key: "heart_penalty" } }))
                ?.value || "1"
        );

        const earnedXP = correctCount * xpPerCorrect;
        const earnedGems = correctCount * gemsPerCorrect;

        const updatedStats = await prisma.user_stats.upsert({
            where: { user_id: userId },
            update: {
                xp: { increment: earnedXP },
                gems: { increment: earnedGems },
                hearts: { decrement: wrongCount * heartPenalty },
            },
            create: {
                user_id: userId,
                xp: earnedXP,
                gems: earnedGems,
                hearts: 5 - wrongCount * heartPenalty,
            },
        });

        const heartsLeft = Math.max(0, updatedStats.hearts);

        await prisma.user_progress.upsert({
            where: { user_id: userId },
            update: { last_completed_lesson_id: String(lessonId) },
            create: {
                user_id: userId,
                lang: lesson.units.language_id.toString(),
                last_completed_lesson_id: String(lessonId),
            },
        });

        // ✅ Percentage score
        const totalQuestions = questions.length;
        const percentage = Math.round((correctCount / totalQuestions) * 100);

        let accuracyTagline = "";
        if (percentage === 100) accuracyTagline = "🌟 Perfect! You're a master!";
        else if (percentage >= 80) accuracyTagline = "💯 Awesome! Keep it up!";
        else if (percentage >= 60) accuracyTagline = "👍 Good job, practice more!";
        else if (percentage >= 40) accuracyTagline = "🙂 Not bad, keep practicing!";
        else accuracyTagline = "💪 Don’t give up! Try again!";

        // Time tagline
        const formattedTime = formatTime(timeTaken || 0);
        let speedTagline = "";
        if (timeTaken < 60000) speedTagline = "⚡ Lightning fast!";
        else if (timeTaken < 180000) speedTagline = "⏱ Great speed!";
        else if (timeTaken < 300000) speedTagline = "🙂 Steady pace!";
        else speedTagline = "🐢 Slow and steady, keep practicing!";

        return res.json({
            status: true,
            message: "Lesson submitted",
            data: {
                correctCount,
                wrongCount,
                earnedXP,
                earnedGems,
                heartsLeft: heartsLeft,
                percentage,
                tagline: {
                    title: accuracyTagline,
                    desc: speedTagline
                },
                time: formattedTime,
            },
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}


module.exports = { getHomeLangauge, getExercisesbyId, submitLesson };