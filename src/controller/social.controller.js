const prisma = require("../prismaClient");
const { shortAgo } = require("./auth.controller");


const followUser = async (req, res) => {
  try {
    const meId = Number(req.user.id);
    const targetId = Number(req.body.targetUserId);

    if (!targetId) {
      return res.status(400).json({ status: false, message: "targetUserId required" });
    }
    if (meId === targetId) {
      return res.status(400).json({ status: false, message: "You cannot follow yourself" });
    }

    const exists = await prisma.users.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!exists) return res.status(404).json({ status: false, message: "Target user not found" });

    await prisma.follows.upsert({
      where: {
        follower_id_following_id: {
          follower_id: meId,
          following_id: targetId,
        },
      },
      update: {},
      create: {
        follower_id: meId,
        following_id: targetId,
      },
    });

    return res.json({ status: true, message: "Followed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: false, message: err.message });
  }
};

const unfollowUser = async (req, res) => {
  try {
    const meId = Number(req.user.id);
    const targetId = Number(req.body.targetUserId);
    if (!targetId) {
      return res.status(400).json({ status: false, message: "targetUserId required" });
    }

    await prisma.follows.deleteMany({
      where: { follower_id: meId, following_id: targetId },
    });

    return res.json({ status: true, message: "Unfollowed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: false, message: err.message });
  }
};

const getFollowers = async (req, res) => {
  try {
    const userId = Number(req.query.userId || req.user.id);

    const [rows, total] = await Promise.all([
      prisma.follows.findMany({
        where: { following_id: userId },
        orderBy: { created_at: "desc" },
        include: {
          follower: { select: { id: true, name: true, profile: true } },
        },
      }),
      prisma.follows.count({ where: { following_id: userId } }),
    ]);

    const items = rows.map(r => ({
      userId: r.follower.id,
      name: r.follower.name ?? "User",
      avatar: r.follower.profile ?? "",
      followedAt: shortAgo(r.created_at),
    }));

    return res.json({
      status: true,
      message: "Followers fetched",
      data: { total, items },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: false, message: err.message });
  }
};


const getFollowing = async (req, res) => {
  try {
    const userId = Number(req.query.userId || req.user.id);

    const [rows, total] = await Promise.all([
      prisma.follows.findMany({
        where: { follower_id: userId },
        orderBy: { created_at: "desc" },
        include: {
          following: { select: { id: true, name: true, profile: true } },
        },
      }),
      prisma.follows.count({ where: { follower_id: userId } }),
    ]);

    const items = rows.map(r => ({
      userId: r.following.id,
      name: r.following.name ?? "User",
      avatar: r.following.profile ?? "",
      followedAt: shortAgo(r.created_at),
    }));

    return res.json({
      status: true,
      message: "Following fetched",
      data: { total, items },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: false, message: err.message });
  }
};


module.exports = {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
};
