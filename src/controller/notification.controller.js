const prisma = require("../prismaClient");

const getNotifications = async (req, res) => {
    try {
        const userId = req.user.id;
        const notifications = await prisma.notifications.findMany({
            where: { user_id: userId },
            orderBy: { created_at: "desc" },
        });

        const unreadCount = await prisma.notifications.count({
            where: { user_id: userId, is_read: false },
        });

        return res.json({
            status: true,
            message: "Notifications fetched",
            data: {
                notifications,
                unreadCount
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

const markAsRead = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        await prisma.notifications.update({
            where: { id: parseInt(id), user_id: userId },
            data: { is_read: true },
        });

        return res.json({ status: true, message: "Notification marked as read" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

const markAllAsRead = async (req, res) => {
    try {
        const userId = req.user.id;

        await prisma.notifications.updateMany({
            where: { user_id: userId, is_read: false },
            data: { is_read: true },
        });

        return res.json({ status: true, message: "All notifications marked as read" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

const deleteNotification = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        await prisma.notifications.delete({
            where: { id: parseInt(id), user_id: userId },
        });

        return res.json({ status: true, message: "Notification deleted" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ status: false, message: err.message });
    }
};

module.exports = {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification
};
