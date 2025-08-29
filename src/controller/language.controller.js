const prisma = require('../prismaClient');

const getHomeLangauge = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await prisma.users.findUnique({
            where: { email },
            include: {
                onboarding_responses: {
                    orderBy: { created_at: 'desc' }, // latest response
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

        return res.json({
            status: true,
            message: "Fetched language units and lessons",
            data: {
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




module.exports = { getHomeLangauge, getExercisesbyId };