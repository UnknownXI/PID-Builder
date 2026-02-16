const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// Generate JWT token
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// Middleware: require authentication
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Middleware: require admin role
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Middleware: require project membership
async function requireProjectAccess(req, res, next) {
  const projectId = req.params.projectId || req.body.project_id || req.query.project_id;
  if (!projectId) {
    return res.status(400).json({ error: 'Project ID required' });
  }

  // Admin bypasses membership check
  if (req.user.role === 'admin') {
    req.projectRole = 'admin';
    return next();
  }

  const result = await query(
    `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2
     UNION
     SELECT 'admin' AS role FROM projects WHERE id = $1 AND owner_id = $2`,
    [projectId, req.user.id]
  );

  if (result.rows.length === 0) {
    return res.status(403).json({ error: 'Access denied to this project' });
  }

  req.projectRole = result.rows[0].role;
  next();
}

module.exports = { generateToken, requireAuth, requireAdmin, requireProjectAccess };
