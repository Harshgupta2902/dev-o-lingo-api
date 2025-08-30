const express = require("express");
const router = express.Router();
const { getProgress, completeLesson, checkStreak } = require('../controller/progress.controller');
const authMiddleware = require("../middleware");

// APIs
router.get("/progress", authMiddleware, getProgress);
router.post("/lesson/complete", authMiddleware, completeLesson);
router.get("/streak/check", authMiddleware, checkStreak);

module.exports = router;
