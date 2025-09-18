const express = require('express');
const { socialLogin, fetchUserData, updateFcmToken, getOnboardingQuestions, submitOnboarding, getUserProfile, getMasterData } = require('../controller/auth.controller');
const router = express.Router();

router.post('/auth/social-login', socialLogin);
router.post('/auth/fetchUserData', fetchUserData);
router.post('/auth/updateFcmToken', updateFcmToken);
router.get('/auth/getOnboardingQuestions', getOnboardingQuestions);
router.post("/auth/submitOnboarding", submitOnboarding);
router.post("/getUserProfile", getUserProfile);
router.get("/getMasterData", getMasterData);


module.exports = router;