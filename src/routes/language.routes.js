const express = require('express');
const { getHomeLangauge } = require('../controller/language.controller');
const router = express.Router();

router.post('/getHomeLangauge', getHomeLangauge);

module.exports = router;
