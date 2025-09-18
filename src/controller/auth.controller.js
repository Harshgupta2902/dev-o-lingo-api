const prisma = require('../prismaClient');
const jwt = require('jsonwebtoken');
const { ensureStatsWithRefill } = require('./progress.controller');
const dayjs = require('dayjs');
const { checkAchievements } = require('./achievement.controller');

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
            return res.json({ status: false, code: "USER_NOT_FOUND", message: "User not found" });
        }

        await checkAchievements(Number(user.id));

        const [
            stats,
            lessonsCompleted,
            followersCount,
            followingCount,
            uaRows,
            followedRows,
        ] = await Promise.all([
            ensureStatsWithRefill(Number(user.id)),

            prisma.user_completed_lessons.count({ where: { user_id: Number(user.id) } }),

            prisma.follows.count({ where: { following_id: Number(user.id) } }),
            prisma.follows.count({ where: { follower_id: Number(user.id) } }),

            prisma.user_achievements.findMany({
                where: { user_id: Number(user.id) },
                orderBy: { unlocked_at: "desc" },
                take: 12,
                include: { achievements: true },
            }),
            prisma.follows.findMany({
                where: { follower_id: Number(user.id) },
                select: { following_id: true },
            }),
        ]);

        const formattedUser = {
            ...user,
            created_at: new Date(user.created_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
            }),
        };

        const achievementItems = uaRows.map((a) => ({
            id: a.id,
            title: a.achievements?.title ?? "",
            description: a.achievements?.description ?? "",
            achieved_at: shortAgo(a.unlocked_at),
        }));

        const followedIds = followedRows.map((r) => r.following_id);
        const excludeIds = [Number(user.id), ...followedIds];

        const notFollowedUsers = await prisma.users.findMany({
            where: { id: { notIn: excludeIds } },
            select: { id: true, name: true, profile: true },
            orderBy: { created_at: "desc" },
            take: 20,
        });

        return res.json({
            status: true,
            message: "User fetched successfully",
            data: {
                user: formattedUser,
                stats,
                lessonsCompleted,
                achievements: achievementItems,
                followers: followersCount,
                following: followingCount,
                notFollowedUsers,
            },
        });
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message });
    }
};


const getMasterData = async (req, res) => {
    try {
        const masterData = await prisma.game_settings.findMany();

        const keyWiseData = masterData.reduce((acc, item) => {
            acc[item.key] = item;
            return acc;
        }, {});

        return res.json({
            status: true,
            message: "Master Data successfully",
            data: keyWiseData
        });
    } catch (err) {
        return res.status(500).json({ status: false, message: err.message });
    }
};




const shortAgo = (date) => {
    if (!date) return null;
    const d = new Date(date);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

function groupBy(arr, keyFn) {
    return arr.reduce((acc, it) => {
        const k = keyFn(it);
        (acc[k] ||= []).push(it);
        return acc;
    }, {});
}

// Same heuristic as earlier answer:
function deriveGroupName(a) {
    if (a.category) return a.category;
    if (a.type) return a.type;
    if (a.title) {
        const m = a.title.match(/^\s*([A-Za-z ]*?[A-Za-z])(?:\s+\d+)?\s*$/);
        if (m && m[1]) return m[1].trim();
    }
    const c = (a.conditions || "").toLowerCase();
    if (c.includes("lesson")) return "Lesson Master";
    if (c.includes("streak")) return "Streak";
    if (c.includes("xp")) return "XP Hunter";
    if (c.includes("practice")) return "Practice Champ";
    if (c.includes("correct")) return "Sharp Mind";
    return "Misc";
}


module.exports = { socialLogin, fetchUserData, updateFcmToken, getOnboardingQuestions, submitOnboarding, getUserProfile, shortAgo, getMasterData }
