// services/notify.js
const messaging = require('./fcm');
const nodemailer = require('nodemailer');
const prisma = require('../prismaClient');

const mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function sendPushToUser(userId, title, body, data = {}) {
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user?.fcm_token) return { ok: false, reason: 'no_fcm_token' };

    const msg = {
        token: user.fcm_token,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    };

    try {
        await messaging.send(msg);
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}

async function sendEmail(to, subject, html) {
    if (!to) return { ok: false, reason: 'no_email' };
    await mailer.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to, subject, html,
    });
    return { ok: true };
}

async function createNotification(userId, title, body, type) {
    return await prisma.notifications.create({
        data: {
            user_id: userId,
            title,
            message: body,
            type,
        }
    });
}

async function notifyUser(userId, title, body, type, data = {}) {
    // 1. Save to database for in-app inbox
    const notification = await createNotification(userId, title, body, type);

    // 2. Send push notification
    const pushResult = await sendPushToUser(userId, title, body, { 
        ...data, 
        notification_id: notification.id,
        type: type
    });

    return { notification, pushResult };
}

module.exports = { sendPushToUser, sendEmail, createNotification, notifyUser };
