const express = require("express");
const router = express.Router();
const { getLeaderboard } = require('../controller/leaderboard.controller');
const authMiddleware = require("../middleware");

// APIs
router.get("/getLeaderboard", authMiddleware, getLeaderboard);

module.exports = router;
