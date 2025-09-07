const prisma = require('../prismaClient');
const jwt = require('jsonwebtoken');
const { ensureStatsWithRefill } = require('./progress.controller');
const dayjs = require('dayjs');

function generateToken(user) {
    return jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET
    );
}


const socialLogin = async (req, res) => {
    try {
        const { uid, provider, name, email, photoURL, fcm_token } = req.body

        if (!uid || !provider) {
            return res.status(400).json({ status: false, message: "uid and provider required" })
        }

        await prisma.users.create({
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

        const jwtToken = generateToken(user)

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
        const { fcm_token, email } = req.body

        if (!email) {
            return res.status(400).json({ status: false, message: "uid and email required" })
        }

        // Upsert user
        let user = await prisma.users.findFirst({
            where: { email }
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


const getUserProfile = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ status: false, message: "email required" });
        }

        const user = await prisma.users.findFirst({ where: { email } });
        if (!user) {
            return res.json({
                status: false,
                code: "USER_NOT_FOUND",
                message: "User not found",
            });
        }

        const formattedUser = {
            ...user,
            created_at: new Date(user.created_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
            }),
        };

        const stats = await ensureStatsWithRefill(Number(user.id));

        const lessonsCompleted = await prisma.user_completed_lessons.count({
            where: { user_id: Number(user.id) },
        });

        const uaRows = await prisma.user_achievements.findMany({
            where: { user_id: Number(user.id) },
            orderBy: { unlocked_at: "desc" },
            take: 12,
            include: { achievements: true },
        });

        const achievementItems = uaRows.map((a) => ({
            id: a.id,
            title: a.achievements?.title ?? "",
            description: a.achievements?.description ?? "",
            icon_url: a.achievements?.icon_url ?? "",
            achieved_at: shortAgo(a.unlocked_at),
        }));

        const [followers, following] = await Promise.all([
            prisma.follows.count({ where: { following_id: Number(user.id) } }),
            prisma.follows.count({ where: { follower_id: Number(user.id) } }),
        ]);

        const followedRows = await prisma.follows.findMany({
            where: { follower_id: Number(user.id) },
            select: { following_id: true },
        });

        const followedIds = followedRows.map((r) => r.following_id);
        const excludeIds = [Number(user.id), ...followedIds];

        const notFollowedUsers = await prisma.users.findMany({
            where: {
                id: { notIn: excludeIds },
            },
            select: {
                id: true,
                name: true,
                profile: true,
            },
            orderBy: { created_at: "desc" },
            take: 20,
        });

        return res.json({
            status: true,
            message: "User Fetched successfully",
            data: {
                user: formattedUser,
                stats,
                lessonsCompleted,
                achievements: achievementItems,
                followers,
                following,
                notFollowedUsers, // 👈 NEW: suggestions
            },
        });
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message });
    }
};


function shortAgo(date) {
    if (!date) return null;
    const now = dayjs();
    const diffSec = now.diff(date, "second");

    if (diffSec < 60) return `${diffSec}s ago`;

    const diffMin = now.diff(date, "minute");
    if (diffMin < 60) return `${diffMin}m ago`;

    const diffHrs = now.diff(date, "hour");
    if (diffHrs < 24) return `${diffHrs}h ago`;

    const diffDays = now.diff(date, "day");
    if (diffDays < 30) return `${diffDays}d ago`;

    const diffMonths = now.diff(date, "month");
    if (diffMonths < 12) return `${diffMonths}mo ago`;

    const diffYears = now.diff(date, "year");
    return `${diffYears}y ago`;
}



module.exports = { socialLogin, fetchUserData, updateFcmToken, getOnboardingQuestions, submitOnboarding, getUserProfile, shortAgo }
