const express = require('express');
const { query, getClient } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/projects - list user's projects
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, u.name AS owner_name,
              COALESCE(pm.role, CASE WHEN p.owner_id = $1 THEN 'owner' END) AS user_role
       FROM projects p
       JOIN users u ON u.id = p.owner_id
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
       WHERE p.owner_id = $1 OR pm.user_id = $1
       ORDER BY p.updated_at DESC`,
      [req.user.id]
    );
    res.json({ projects: result.rows });
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ error: 'Failed to list projects' });
  }
});

// POST /api/projects - create project
router.post('/', requireAuth, async (req, res) => {
  const client = await getClient();
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO projects (name, description, owner_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, description || null, req.user.id]
    );

    const project = result.rows[0];

    // Create default root folder
    await client.query(
      `INSERT INTO folders (project_id, name, path, created_by)
       VALUES ($1, 'Root', '/', $2)`,
      [project.id, req.user.id]
    );

    await client.query('COMMIT');
    res.status(201).json({ project });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  } finally {
    client.release();
  }
});

// GET /api/projects/:projectId - get project details
router.get('/:projectId', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, u.name AS owner_name
       FROM projects p
       JOIN users u ON u.id = p.owner_id
       WHERE p.id = $1 AND (p.owner_id = $2 OR EXISTS (
         SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2
       ))`,
      [req.params.projectId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ project: result.rows[0] });
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// PUT /api/projects/:projectId - update project
router.put('/:projectId', requireAuth, async (req, res) => {
  try {
    const { name, description } = req.body;

    const result = await query(
      `UPDATE projects SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = NOW()
       WHERE id = $3 AND owner_id = $4
       RETURNING *`,
      [name, description, req.params.projectId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    res.json({ project: result.rows[0] });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:projectId
router.delete('/:projectId', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM projects WHERE id = $1 AND owner_id = $2 RETURNING id',
      [req.params.projectId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    res.json({ message: 'Project deleted' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// POST /api/projects/:projectId/members - add member
router.post('/:projectId/members', requireAuth, async (req, res) => {
  try {
    const { email, role } = req.body;

    // Verify ownership
    const project = await query(
      'SELECT id FROM projects WHERE id = $1 AND owner_id = $2',
      [req.params.projectId, req.user.id]
    );
    if (project.rows.length === 0) {
      return res.status(403).json({ error: 'Only the owner can add members' });
    }

    // Find user by email
    const user = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = $3
       RETURNING *`,
      [req.params.projectId, user.rows[0].id, role || 'editor']
    );

    res.status(201).json({ member: result.rows[0] });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

module.exports = router;
