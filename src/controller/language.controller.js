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
            where: { title: learningLanguage },
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

module.exports = { getHomeLangauge };