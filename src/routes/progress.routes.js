const express = require("express");
const router = express.Router();
const { completeLesson, checkStreak, getUserStats } = require('../controller/progress.controller');
const authMiddleware = require("../middleware");

// APIs
router.post("/lesson/complete", authMiddleware, completeLesson);
router.get("/streak/check", authMiddleware, checkStreak);
router.get("/getUserStats", authMiddleware, getUserStats);

module.exports = router;
