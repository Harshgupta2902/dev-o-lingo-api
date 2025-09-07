const express = require("express");
const router = express.Router();
const { followUser, unfollowUser, getFollowers, getFollowing } = require("../controller/social.controller");

const requireAuth = require("../middleware");

router.post("/follow", requireAuth, followUser);
router.post("/unfollow", requireAuth, unfollowUser);

router.get("/followers", requireAuth, getFollowers);
router.get("/following", requireAuth, getFollowing);


module.exports = router;
