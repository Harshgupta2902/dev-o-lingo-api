const router = require("express").Router();
const { rewardHeartsForAd, rewardGemsForAd } = require("../controller/ads.controller");
const auth = require("../middleware");


router.post("/ads/reward/hearts", auth, rewardHeartsForAd);
router.post("/ads/reward/gems", auth, rewardGemsForAd);

module.exports = router;
