const express = require("express");
const router = express.Router();
const { 
    getNotifications, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification 
} = require("../controller/notification.controller");

const requireAuth = require("../middleware");

router.get("/notifications", requireAuth, getNotifications);
router.post("/notifications/read/:id", requireAuth, markAsRead);
router.post("/notifications/read-all", requireAuth, markAllAsRead);
router.delete("/notifications/:id", requireAuth, deleteNotification);

module.exports = router;
