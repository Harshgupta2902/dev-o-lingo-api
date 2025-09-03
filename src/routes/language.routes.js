const express = require('express');
const { getHomeLangauge, getExercisesbyId, submitLesson } = require('../controller/language.controller');
const router = express.Router();
const authMiddleware = require("../middleware");

router.post('/getHomeLangauge', authMiddleware, getHomeLangauge);
router.post('/getExercisesbyId', authMiddleware, getExercisesbyId);
router.post('/submitLesson', authMiddleware, submitLesson);

module.exports = router;
