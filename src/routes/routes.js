const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const homeLanguageRoutes = require('./language.routes');

router.use(authRoutes);
router.use(homeLanguageRoutes);


module.exports = router;
