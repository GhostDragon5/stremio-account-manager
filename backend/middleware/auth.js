const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';

if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

/**
 * Generate JWT token
 */
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Authentication middleware
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  req.user = decoded;
  next();
}

/**
 * Authorization middleware - check if user owns the resource
 */
function authorize(req, res, next) {
  // This will be implemented per endpoint
  next();
}

module.exports = {
  generateToken,
  verifyToken,
  authenticate,
  authorize
};