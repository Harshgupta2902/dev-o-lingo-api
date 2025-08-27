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

        // Upsert user
        let user = await prisma.users.upsert({
            where: { email },
            update: {
                name,
                email,
                profile: photoURL,
                fcm_token,
                login_type: provider.toUpperCase(),
            },
            create: {
                uid,
                name,
                email,
                profile: photoURL,
                fcm_token,
                login_type: provider.toUpperCase(),
                password: "",
            },
        })

        // Generate token
        const jwtToken = generateToken(user.id)

        await prisma.users.update({
            where: { id: user.id },
            data: { token: jwtToken },
        })

        return res.json({
            status: true,
            message: "Login successful",
            data: { jwtToken, user },
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

        // Upsert user
        let user = await prisma.users.findFirst({
            where: { uid, email }
        })

        // Generate token
        const jwtToken = generateToken(user.id)

        await prisma.users.update({
            where: { id: user.id },
            data: { token: jwtToken },
        })

        return res.json({
            status: true,
            message: "User Fetched successful",
            data: { jwtToken, user },
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

module.exports = { socialLogin, fetchUserData, getOnboardingQuestions }
