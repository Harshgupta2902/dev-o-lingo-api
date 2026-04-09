const express = require("express");
const router = express.Router();
const { getUserStats } = require('../controller/progress.controller');
const authMiddleware = require("../middleware");

// APIs
router.get("/getUserStats", authMiddleware, getUserStats);

module.exports = router;
