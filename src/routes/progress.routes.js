const express = require("express");
const router = express.Router();
const { checkStreak, getUserStats } = require('../controller/progress.controller');
const authMiddleware = require("../middleware");

// APIs
router.get("/streak/check", authMiddleware, checkStreak);
router.get("/getUserStats", authMiddleware, getUserStats);

module.exports = router;
