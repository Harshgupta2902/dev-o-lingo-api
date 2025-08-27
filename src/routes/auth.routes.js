const express = require('express');
const { socialLogin, fetchUserData, getOnboardingQuestions } = require('../controller/auth.controller');
const router = express.Router();

router.post('/auth/social-login', socialLogin);
router.post('/auth/getProfile', fetchUserData);
router.post('/auth/getOnboardingQuestions', getOnboardingQuestions);

module.exports = router;