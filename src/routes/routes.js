const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const homeLanguageRoutes = require('./language.routes');
const progressRoutes = require('./progress.routes');
const dailyPracticeRoutes = require('./dailyPractice.routes');

router.use(authRoutes);
router.use(homeLanguageRoutes);
router.use(progressRoutes);
router.use(dailyPracticeRoutes);


module.exports = router;
