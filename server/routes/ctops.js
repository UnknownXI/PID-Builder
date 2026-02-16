const express = require('express');
const { query, getClient } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/ctops?project_id=X - list CTOPs
router.get('/', requireAuth, async (req, res) => {
  try {
    const { project_id } = req.query;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    const result = await query(
      `SELECT c.*, u.name AS created_by_name,
              (SELECT COUNT(*) FROM ctop_items ci WHERE ci.ctop_id = c.id) AS item_count
       FROM ctops c
       JOIN users u ON u.id = c.created_by
       WHERE c.project_id = $1
       ORDER BY c.updated_at DESC`,
      [project_id]
    );

    res.json({ ctops: result.rows });
  } catch (err) {
    console.error('List CTOPs error:', err);
    res.status(500).json({ error: 'Failed to list CTOPs' });
  }
});

// POST /api/ctops - create CTOP
router.post('/', requireAuth, async (req, res) => {
  try {
    const { project_id, name, description } = req.body;

    if (!project_id || !name) {
      return res.status(400).json({ error: 'project_id and name are required' });
    }

    const result = await query(
      `INSERT INTO ctops (project_id, name, description, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [project_id, name, description || null, req.user.id]
    );

    res.status(201).json({ ctop: result.rows[0] });
  } catch (err) {
    console.error('Create CTOP error:', err);
    res.status(500).json({ error: 'Failed to create CTOP' });
  }
});

// GET /api/ctops/:id - get CTOP with items
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const ctopResult = await query(
      `SELECT c.*, u.name AS created_by_name
       FROM ctops c
       JOIN users u ON u.id = c.created_by
       WHERE c.id = $1`,
      [req.params.id]
    );

    if (ctopResult.rows.length === 0) {
      return res.status(404).json({ error: 'CTOP not found' });
    }

    // Get items with details
    const items = await query(
      `SELECT ci.*,
              f.original_name AS file_name, f.mime_type AS file_mime_type, f.storage_key AS file_storage_key,
              t.name AS template_name,
              ft.name AS filled_template_name, ft.storage_key AS filled_storage_key
       FROM ctop_items ci
       LEFT JOIN files f ON f.id = ci.file_id
       LEFT JOIN templates t ON t.id = ci.template_id
       LEFT JOIN filled_templates ft ON ft.id = ci.filled_template_id
       WHERE ci.ctop_id = $1
       ORDER BY ci.sort_order`,
      [req.params.id]
    );

    const ctop = ctopResult.rows[0];
    ctop.items = items.rows;

    res.json({ ctop });
  } catch (err) {
    console.error('Get CTOP error:', err);
    res.status(500).json({ error: 'Failed to get CTOP' });
  }
});

// POST /api/ctops/:id/items - add item to CTOP
router.post('/:id/items', requireAuth, async (req, res) => {
  try {
    const { item_type, file_id, template_id, filled_template_id, notes } = req.body;

    if (!item_type) {
      return res.status(400).json({ error: 'item_type is required' });
    }

    // Get current max sort order
    const maxOrder = await query(
      'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM ctop_items WHERE ctop_id = $1',
      [req.params.id]
    );

    const result = await query(
      `INSERT INTO ctop_items (ctop_id, item_type, file_id, template_id, filled_template_id, sort_order, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.params.id,
        item_type,
        file_id || null,
        template_id || null,
        filled_template_id || null,
        maxOrder.rows[0].max_order + 1,
        notes || null,
      ]
    );

    // Update CTOP timestamp
    await query('UPDATE ctops SET updated_at = NOW() WHERE id = $1', [req.params.id]);

    res.status(201).json({ item: result.rows[0] });
  } catch (err) {
    console.error('Add CTOP item error:', err);
    res.status(500).json({ error: 'Failed to add item to CTOP' });
  }
});

// PUT /api/ctops/:id/items/reorder - reorder items
router.put('/:id/items/reorder', requireAuth, async (req, res) => {
  const client = await getClient();
  try {
    const { item_ids } = req.body; // Array of item IDs in desired order

    if (!item_ids || !Array.isArray(item_ids)) {
      return res.status(400).json({ error: 'item_ids array is required' });
    }

    await client.query('BEGIN');

    for (let i = 0; i < item_ids.length; i++) {
      await client.query(
        'UPDATE ctop_items SET sort_order = $1 WHERE id = $2 AND ctop_id = $3',
        [i, item_ids[i], req.params.id]
      );
    }

    await client.query('COMMIT');
    res.json({ message: 'Items reordered' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reorder error:', err);
    res.status(500).json({ error: 'Failed to reorder items' });
  } finally {
    client.release();
  }
});

// DELETE /api/ctops/:id/items/:itemId - remove item from CTOP
router.delete('/:id/items/:itemId', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM ctop_items WHERE id = $1 AND ctop_id = $2 RETURNING id',
      [req.params.itemId, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ message: 'Item removed from CTOP' });
  } catch (err) {
    console.error('Remove CTOP item error:', err);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

// PUT /api/ctops/:id - update CTOP
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, description, status } = req.body;

    const result = await query(
      `UPDATE ctops SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [name, description, status, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'CTOP not found' });
    }

    res.json({ ctop: result.rows[0] });
  } catch (err) {
    console.error('Update CTOP error:', err);
    res.status(500).json({ error: 'Failed to update CTOP' });
  }
});

// DELETE /api/ctops/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM ctops WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'CTOP not found' });
    }

    res.json({ message: 'CTOP deleted' });
  } catch (err) {
    console.error('Delete CTOP error:', err);
    res.status(500).json({ error: 'Failed to delete CTOP' });
  }
});

module.exports = router;
