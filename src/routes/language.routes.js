const express = require('express');
const { getHomeLangauge, getExercisesbyId } = require('../controller/language.controller');
const router = express.Router();

router.post('/getHomeLangauge', getHomeLangauge);
router.post('/getExercisesbyId', getExercisesbyId);

module.exports = router;
