const express = require("express");
const router = express.Router();
const auth = require("../middleware");
const {
  getPracticeById,
  submitPractice,
  getWeek,
  getReviewSet,
} = require("../controller/dailyPractice.controller");


router.get("/daily-practice/week", auth, getWeek);
router.post("/get-daily-practice", auth, getPracticeById);
router.post("/daily-practice/submit", auth, submitPractice);

router.get("/review", auth, getReviewSet);

module.exports = router;