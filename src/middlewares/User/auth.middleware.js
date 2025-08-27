const { verifyToken } = require('../../utils/jwt');

const verifyJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(400).json({
      success: false,
      message: 'No Token Found.',
    });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: 'Invalid token.',
    });
  }
};

module.exports = { verifyJWT };
