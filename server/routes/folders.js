const express = require('express');
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/folders?project_id=X - list folders for a project
router.get('/', requireAuth, async (req, res) => {
  try {
    const { project_id } = req.query;
    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    const result = await query(
      `SELECT f.*, u.name AS created_by_name,
              (SELECT COUNT(*) FROM files fi WHERE fi.folder_id = f.id) AS file_count,
              (SELECT COUNT(*) FROM folders c WHERE c.parent_id = f.id) AS subfolder_count
       FROM folders f
       LEFT JOIN users u ON u.id = f.created_by
       WHERE f.project_id = $1
       ORDER BY f.path`,
      [project_id]
    );

    res.json({ folders: result.rows });
  } catch (err) {
    console.error('List folders error:', err);
    res.status(500).json({ error: 'Failed to list folders' });
  }
});

// GET /api/folders/:id/children - get direct children of a folder
router.get('/:id/children', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT f.*,
              (SELECT COUNT(*) FROM files fi WHERE fi.folder_id = f.id) AS file_count,
              (SELECT COUNT(*) FROM folders c WHERE c.parent_id = f.id) AS subfolder_count
       FROM folders f
       WHERE f.parent_id = $1
       ORDER BY f.name`,
      [req.params.id]
    );

    res.json({ folders: result.rows });
  } catch (err) {
    console.error('Get children error:', err);
    res.status(500).json({ error: 'Failed to get folder children' });
  }
});

// POST /api/folders - create folder
router.post('/', requireAuth, async (req, res) => {
  try {
    const { project_id, parent_id, name, description } = req.body;

    if (!project_id || !name) {
      return res.status(400).json({ error: 'project_id and name are required' });
    }

    // Build path from parent
    let parentPath = '/';
    if (parent_id) {
      const parent = await query('SELECT path FROM folders WHERE id = $1', [parent_id]);
      if (parent.rows.length === 0) {
        return res.status(404).json({ error: 'Parent folder not found' });
      }
      parentPath = parent.rows[0].path;
    }

    const folderPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;

    const result = await query(
      `INSERT INTO folders (project_id, parent_id, name, path, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [project_id, parent_id || null, name, folderPath, description || null, req.user.id]
    );

    res.status(201).json({ folder: result.rows[0] });
  } catch (err) {
    console.error('Create folder error:', err);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// PUT /api/folders/:id - rename/move folder
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, description, parent_id } = req.body;

    // If moving, recalculate path
    let newPath;
    if (parent_id !== undefined) {
      let parentPath = '/';
      if (parent_id) {
        const parent = await query('SELECT path FROM folders WHERE id = $1', [parent_id]);
        if (parent.rows.length === 0) {
          return res.status(404).json({ error: 'Parent folder not found' });
        }
        parentPath = parent.rows[0].path;
      }
      const folderName = name || (await query('SELECT name FROM folders WHERE id = $1', [req.params.id])).rows[0]?.name;
      newPath = parentPath === '/' ? `/${folderName}` : `${parentPath}/${folderName}`;
    }

    const result = await query(
      `UPDATE folders SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        parent_id = COALESCE($3, parent_id),
        path = COALESCE($4, path),
        updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [name, description, parent_id, newPath, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json({ folder: result.rows[0] });
  } catch (err) {
    console.error('Update folder error:', err);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// DELETE /api/folders/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM folders WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json({ message: 'Folder deleted' });
  } catch (err) {
    console.error('Delete folder error:', err);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

module.exports = router;
