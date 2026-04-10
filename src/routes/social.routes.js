const express = require("express");
const router = express.Router();
const { followUser, unfollowUser, getFollowers, getFollowing, blockUser, reportUser, removeFollower } = require("../controller/social.controller");

const requireAuth = require("../middleware");

router.post("/follow", requireAuth, followUser);
router.post("/unfollow", requireAuth, unfollowUser);
router.post("/block", requireAuth, blockUser);
router.post("/report", requireAuth, reportUser);
router.post("/remove-follower", requireAuth, removeFollower);

router.get("/followers", requireAuth, getFollowers);
router.get("/following", requireAuth, getFollowing);


module.exports = router;
