const express = require("express");
const router = express.Router();
const { getUserStats, getPublicUserStats } = require('../controller/progress.controller');
const authMiddleware = require("../middleware");

// APIs
router.get("/getUserStats", authMiddleware, getUserStats);
router.get("/getPublicUserStats", authMiddleware, getPublicUserStats);

module.exports = router;
