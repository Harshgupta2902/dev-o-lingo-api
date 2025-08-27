const prisma = require('../prismaClient');
const jwt = require('jsonwebtoken');

function generateToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" })
}

const socialLogin = async (req, res) => {
    try {
        const { uid, provider, name, email, photoURL, fcm_token } = req.body

        if (!uid || !provider) {
            return res.status(400).json({ status: false, message: "uid and provider required" })
        }

        let user = await prisma.users.create({
            data: {
                uid,
                name,
                email,
                profile: photoURL,
                fcm_token,
                login_type: provider.toUpperCase(),
                password: "",
                role: "LEARNER"
            }
        });

        return res.json({
            status: true,
            message: "User Created successfully",
        })
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message })
    }
}


const fetchUserData = async (req, res) => {
    try {
        const { uid, email } = req.body

        if (!uid || !email) {
            return res.status(400).json({ status: false, message: "uid and email required" })
        }

        const user = await prisma.users.findFirst({
            where: { uid, email },
        });

        if (!user) {
            return res.json({
                status: false,
                code: "USER_NOT_FOUND",
                message: "User not found"
            })
        }


        const jwtToken = generateToken(user.id)

        await prisma.users.update({
            where: { id: user.id },
            data: { token: jwtToken },
        })

        return res.json({
            status: true,
            message: "User Fetched successfully",
            data: { jwtToken, user },
        })
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message })
    }
}

const updateFcmToken = async (req, res) => {
    try {
        const { fcm_token, email, uid } = req.body

        if (!uid || !email) {
            return res.status(400).json({ status: false, message: "uid and email required" })
        }

        // Upsert user
        let user = await prisma.users.findFirst({
            where: { uid, email }
        })

        await prisma.users.update({
            where: { id: user.id },
            data: { fcm_token: fcm_token },
        })

        return res.json({
            status: true,
            message: "Token Updated successful",
        })
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message })
    }
}


async function getOnboardingQuestions(req, res) {
    try {
        const questions = await prisma.onboarding_questions.findMany({
            include: {
                onboarding_options: true, // 👈 pulls all related options
            },
            orderBy: { id: 'asc' }, // optional, to keep consistent ordering
        });

        return res.json({
            status: true,
            message: "Onboarding questions fetched successfully",
            data: questions,
        });
    } catch (err) {
        console.error("Error fetching onboarding questions:", err);
        return res.status(500).json({
            status: false,
            message: err.message,
        });
    }
}

const submitOnboarding = async (req, res) => {
    try {
        const { userId, metadata, questionnaire } = req.body;

        const answersArray = Object.entries(questionnaire).map(([key, value]) => ({
            question_key: key,
            answer_value: value
        }));

        const response = await prisma.onboarding_responses.create({
            data: {
                user_id: Number(userId),
                build_no: metadata.buildNo,
                build_signature: metadata.buildSignature,
                version: metadata.version,
                completed_at: new Date(metadata.completedAt),
                onboarding_answers: {
                    create: answersArray
                }
            },
            include: {
                onboarding_answers: true
            }
        });

        return res.json({ status: true, message: "Onboarding submitted", data: response });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

module.exports = { socialLogin, fetchUserData, updateFcmToken, getOnboardingQuestions, submitOnboarding }
