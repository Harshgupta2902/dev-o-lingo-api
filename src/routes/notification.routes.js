const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware");
const {
    getNotifications,
    markAllAsRead,
} = require("../controller/notification.controller");

router.get("/notifications", requireAuth, getNotifications);
router.post("/notifications/read-all", requireAuth, markAllAsRead);

module.exports = router;
