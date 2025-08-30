const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const homeLanguageRoutes = require('./language.routes');
const progressRoutes = require('./progress.routes');

router.use(authRoutes);
router.use(homeLanguageRoutes);
router.use(progressRoutes);


module.exports = router;
