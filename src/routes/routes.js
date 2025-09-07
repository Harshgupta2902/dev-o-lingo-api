const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const homeLanguageRoutes = require('./language.routes');
const progressRoutes = require('./progress.routes');
const dailyPracticeRoutes = require('./dailyPractice.routes');
const leaderboardRoutes = require('./leaderboard.routes');

router.use(authRoutes);
router.use(homeLanguageRoutes);
router.use(progressRoutes);
router.use(dailyPracticeRoutes);
router.use(leaderboardRoutes);


module.exports = router;
