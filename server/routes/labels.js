const express = require('express');
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/labels?project_id=X - list labels (predefined + project custom)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { project_id } = req.query;

    let sql = `
      SELECT l.*,
             (SELECT COUNT(*) FROM file_labels fl WHERE fl.label_id = l.id) AS usage_count
      FROM labels l
      WHERE l.is_predefined = TRUE
    `;
    const params = [];

    if (project_id) {
      sql += ` OR l.project_id = $1`;
      params.push(project_id);
    }

    sql += ` ORDER BY l.is_predefined DESC, l.name ASC`;

    const result = await query(sql, params);
    res.json({ labels: result.rows });
  } catch (err) {
    console.error('List labels error:', err);
    res.status(500).json({ error: 'Failed to list labels' });
  }
});

// POST /api/labels - create custom label
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, color, project_id } = req.body;

    if (!name || !project_id) {
      return res.status(400).json({ error: 'name and project_id are required' });
    }

    const result = await query(
      `INSERT INTO labels (name, color, is_predefined, project_id, created_by)
       VALUES ($1, $2, FALSE, $3, $4)
       RETURNING *`,
      [name, color || '#3B82F6', project_id, req.user.id]
    );

    res.status(201).json({ label: result.rows[0] });
  } catch (err) {
    console.error('Create label error:', err);
    res.status(500).json({ error: 'Failed to create label' });
  }
});

// PUT /api/labels/:id - update custom label
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, color } = req.body;

    const result = await query(
      `UPDATE labels SET name = COALESCE($1, name), color = COALESCE($2, color)
       WHERE id = $3 AND is_predefined = FALSE
       RETURNING *`,
      [name, color, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Label not found or is predefined' });
    }

    res.json({ label: result.rows[0] });
  } catch (err) {
    console.error('Update label error:', err);
    res.status(500).json({ error: 'Failed to update label' });
  }
});

// DELETE /api/labels/:id - delete custom label
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM labels WHERE id = $1 AND is_predefined = FALSE RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Label not found or is predefined' });
    }

    res.json({ message: 'Label deleted' });
  } catch (err) {
    console.error('Delete label error:', err);
    res.status(500).json({ error: 'Failed to delete label' });
  }
});

// POST /api/labels/assign - assign label to file
router.post('/assign', requireAuth, async (req, res) => {
  try {
    const { file_id, label_id } = req.body;

    if (!file_id || !label_id) {
      return res.status(400).json({ error: 'file_id and label_id are required' });
    }

    const result = await query(
      `INSERT INTO file_labels (file_id, label_id, assigned_by)
       VALUES ($1, $2, 'user')
       ON CONFLICT (file_id, label_id) DO NOTHING
       RETURNING *`,
      [file_id, label_id]
    );

    res.status(201).json({ assignment: result.rows[0] || { file_id, label_id, message: 'Already assigned' } });
  } catch (err) {
    console.error('Assign label error:', err);
    res.status(500).json({ error: 'Failed to assign label' });
  }
});

// DELETE /api/labels/assign - remove label from file
router.delete('/assign', requireAuth, async (req, res) => {
  try {
    const { file_id, label_id } = req.body;

    await query(
      'DELETE FROM file_labels WHERE file_id = $1 AND label_id = $2',
      [file_id, label_id]
    );

    res.json({ message: 'Label removed from file' });
  } catch (err) {
    console.error('Remove label error:', err);
    res.status(500).json({ error: 'Failed to remove label' });
  }
});

module.exports = router;
