const prisma = require('../prismaClient');
const { checkAchievements } = require('./achievement.controller');
const { updateLeaderboard } = require('./leaderboard.controller');
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

        if (!external_id) {
            return res
                .status(404)
                .json({ status: false, message: "No ID Found" });
        }

        const exercise = await prisma.exercises.findFirst({
            where: { slug: external_id },
        });

        if (!exercise) {
            return res
                .status(404)
                .json({ status: false, message: "No Exercise Found" });
        }

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

        const tasks = {
            task1: questions[0].task1,
            task2: questions[0].task2,
        };

        let questionList = questions.map((q) => ({
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

        questionList = shuffleArray(questionList);

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
        const { lessonId: lessonIdRaw, answers = {}, timeTaken = 0 } = req.body;

        const lessonId = Number(lessonIdRaw);

        const [lesson, questions, settingsRows] = await Promise.all([
            prisma.lessons.findUnique({
                where: { id: lessonId },
                include: { units: true },
            }),
            prisma.questions.findMany({
                where: {
                    map_key: (await prisma.lessons.findUnique({ where: { id: lessonId } }))?.external_id,
                },
            }),
            prisma.game_settings.findMany({
                where: { key: { in: ["xp_per_correct", "gems_per_correct", "heart_penalty"] } },
            }),
        ]);

        if (!lesson) {
            return res.status(404).json({ status: false, message: "Lesson not found" });
        }

        if (!questions.length) {
            return res.json({
                status: true,
                message: "Lesson has no questions",
                data: {
                    correctCount: 0,
                    wrongCount: 0,
                    earnedXP: 0,
                    earnedGems: 0,
                    heartsLeft: 5,
                    percentage: 0,
                    tagline: { title: "No questions in this lesson", desc: "" },
                    time: formatTime(timeTaken),
                },
            });
        }

        // settings map with defaults
        const settings = settingsRows.reduce((m, r) => ((m[r.key] = r.value), m), {});
        const xpPerCorrect = parseInt(settings["xp_per_correct"] ?? "10", 10);
        const gemsPerCorrect = parseInt(settings["gems_per_correct"] ?? "1", 10);
        const heartPenalty = parseInt(settings["heart_penalty"] ?? "1", 10);

        // compare answers
        let correctCount = 0;
        let wrongCount = 0;

        questions.forEach((q, idx) => {
            const byId = answers?.[q.id] ?? answers?.[String(q.id)];
            const byIdx = answers?.[idx] ?? answers?.[String(idx)];
            const userAnswerRaw = byId ?? byIdx ?? "";
            const isCorrect = normalize(userAnswerRaw) === normalize(q.answer);
            if (isCorrect) correctCount++;
            else wrongCount++;
        });

        const earnedXP = correctCount * xpPerCorrect;
        const earnedGems = correctCount * gemsPerCorrect;

        // progress check
        const existingProgress = await prisma.user_progress.findUnique({
            where: { user_id: userId },
        });

        const lastCompleted = existingProgress
            ? Number(existingProgress.last_completed_lesson_id)
            : null;
        const isNewLesson = !lastCompleted || lessonId > lastCompleted;

        // stats update
        const existingStats = await prisma.user_stats.findUnique({ where: { user_id: userId } });
        const currentHearts = existingStats?.hearts ?? 5;
        const newHearts = Math.max(0, currentHearts - wrongCount * heartPenalty);

        let updatedStats;
        if (isNewLesson) {
            // update xp + gems + hearts
            updatedStats = await prisma.user_stats.upsert({
                where: { user_id: userId },
                update: {
                    xp: { increment: earnedXP },
                    gems: { increment: earnedGems },
                    hearts: newHearts,
                    updated_at: new Date(),
                },
                create: {
                    user_id: userId,
                    xp: earnedXP,
                    gems: earnedGems,
                    hearts: newHearts,
                    created_at: new Date(),
                    updated_at: new Date(),
                },
            });

            // update progress
            await prisma.user_progress.upsert({
                where: { user_id: userId },
                update: {
                    last_completed_lesson_id: String(lessonId),
                    updated_at: new Date(),
                },
                create: {
                    user_id: userId,
                    lang: String(lesson.units.language_id),
                    last_completed_lesson_id: String(lessonId),
                    updated_at: new Date(),
                },
            });

            // ✅ Track completed lesson in new table
            await prisma.user_completed_lessons.upsert({
                where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
                update: {},
                create: { user_id: userId, lesson_id: lessonId },
            });
        } else {
            // only update hearts
            updatedStats = await prisma.user_stats.update({
                where: { user_id: userId },
                data: {
                    hearts: newHearts,
                    updated_at: new Date(),
                },
            });
        }

        // score + taglines
        const totalQuestions = questions.length;
        const percentage = Math.round((correctCount / totalQuestions) * 100);

        let accuracyTagline = "";
        if (percentage === 100) accuracyTagline = "🌟 Perfect! You're a master!";
        else if (percentage >= 80) accuracyTagline = "💯 Awesome! Keep it up!";
        else if (percentage >= 60) accuracyTagline = "👍 Good job, practice more!";
        else if (percentage >= 40) accuracyTagline = "🙂 Not bad, keep practicing!";
        else accuracyTagline = "💪 Don’t give up! Try again!";

        const formattedTime = formatTime(timeTaken || 0);
        let speedTagline = "";
        if (timeTaken < 60_000) speedTagline = "⚡ Lightning fast!";
        else if (timeTaken < 180_000) speedTagline = "⏱ Great speed!";
        else if (timeTaken < 300_000) speedTagline = "🙂 Steady pace!";
        else speedTagline = "🐢 Slow and steady, keep practicing!";

        // ✅ Update leaderboard & achievements
        await updateLeaderboard(userId, earnedXP);
        await checkAchievements(userId);

        return res.json({
            status: true,
            message: "Lesson submitted",
            data: {
                correctCount,
                wrongCount,
                earnedXP: isNewLesson ? earnedXP : 0,
                earnedGems: isNewLesson ? earnedGems : 0,
                heartsLeft: updatedStats.hearts,
                percentage,
                tagline: { title: accuracyTagline, desc: speedTagline },
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
const normalize = (s) => (typeof s === "string" ? s.trim().toLowerCase() : "");

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

module.exports = { getHomeLangauge, getExercisesbyId, submitLesson };