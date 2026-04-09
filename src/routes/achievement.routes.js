const express = require('express');
const router = express.Router();
const { getAchievements } = require('../controller/achievement.controller');
const authMiddleware = require('../middleware');

router.get('/achievements', authMiddleware, getAchievements);

module.exports = router;
