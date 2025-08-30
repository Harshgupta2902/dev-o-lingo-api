const express = require("express");
const router = express.Router();
const auth = require("../middleware");
const {
  assignPractice,
  getTodayPractice,
  submitPractice,
  getPracticeHistory
} = require("../controller/dailyPractice.controller");

router.get("/daily-practice/today", auth, getTodayPractice);
router.post("/daily-practice/submit", auth, submitPractice);
router.get("/daily-practice/history", auth, getPracticeHistory);

module.exports = router;
