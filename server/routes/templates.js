const express = require('express');
const multer = require('multer');
const { query, getClient } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { uploadFile, getFile, getDownloadUrl } = require('../services/storage');
const { extractPlaceholders, fillTemplate } = require('../services/docx');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Word documents (.docx) are accepted'));
    }
  },
});

// GET /api/templates?project_id=X - list templates
router.get('/', requireAuth, async (req, res) => {
  try {
    const { project_id } = req.query;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    const result = await query(
      `SELECT t.*, u.name AS uploaded_by_name,
              (SELECT COUNT(*) FROM template_placeholders tp WHERE tp.template_id = t.id) AS placeholder_count,
              (SELECT COUNT(*) FROM filled_templates ft WHERE ft.template_id = t.id) AS fill_count
       FROM templates t
       JOIN users u ON u.id = t.uploaded_by
       WHERE t.project_id = $1
       ORDER BY t.created_at DESC`,
      [project_id]
    );

    res.json({ templates: result.rows });
  } catch (err) {
    console.error('List templates error:', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// POST /api/templates/upload - upload Word template and detect placeholders
router.post('/upload', requireAuth, upload.single('template'), async (req, res) => {
  const client = await getClient();
  try {
    const { project_id, name, description } = req.body;

    if (!project_id || !req.file) {
      return res.status(400).json({ error: 'project_id and template file are required' });
    }

    await client.query('BEGIN');

    // Upload to S3
    const storageKey = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      `projects/${project_id}/templates/`
    );

    // Save template record
    const templateResult = await client.query(
      `INSERT INTO templates (project_id, name, description, storage_key, uploaded_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [project_id, name || req.file.originalname, description || null, storageKey, req.user.id]
    );

    const template = templateResult.rows[0];

    // Extract and save placeholders
    const placeholders = extractPlaceholders(req.file.buffer);

    for (let i = 0; i < placeholders.length; i++) {
      await client.query(
        `INSERT INTO template_placeholders (template_id, placeholder_name, display_label, sort_order)
         VALUES ($1, $2, $3, $4)`,
        [
          template.id,
          placeholders[i],
          placeholders[i].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          i,
        ]
      );
    }

    await client.query('COMMIT');

    // Return template with placeholders
    template.placeholders = placeholders.map((p, i) => ({
      placeholder_name: p,
      display_label: p.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      sort_order: i,
    }));

    res.status(201).json({ template });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Upload template error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload template' });
  } finally {
    client.release();
  }
});

// GET /api/templates/:id - get template with placeholders
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const templateResult = await query(
      `SELECT t.*, u.name AS uploaded_by_name
       FROM templates t
       JOIN users u ON u.id = t.uploaded_by
       WHERE t.id = $1`,
      [req.params.id]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const placeholders = await query(
      `SELECT * FROM template_placeholders
       WHERE template_id = $1
       ORDER BY sort_order`,
      [req.params.id]
    );

    const template = templateResult.rows[0];
    template.placeholders = placeholders.rows;

    res.json({ template });
  } catch (err) {
    console.error('Get template error:', err);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

// POST /api/templates/:id/fill - fill template with data
router.post('/:id/fill', requireAuth, async (req, res) => {
  const client = await getClient();
  try {
    const { values, name, project_id } = req.body;

    if (!values || !project_id) {
      return res.status(400).json({ error: 'values and project_id are required' });
    }

    // Get template
    const templateResult = await query(
      'SELECT * FROM templates WHERE id = $1',
      [req.params.id]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = templateResult.rows[0];

    // Get template file from S3
    const docxBuffer = await getFile(template.storage_key);

    // Fill template
    const filledBuffer = fillTemplate(docxBuffer, values);

    // Upload filled document to S3
    const filledName = name || `${template.name} - Filled ${new Date().toISOString().split('T')[0]}`;
    const storageKey = await uploadFile(
      filledBuffer,
      `${filledName}.docx`,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      `projects/${project_id}/filled/`
    );

    await client.query('BEGIN');

    // Save filled template record
    const filledResult = await client.query(
      `INSERT INTO filled_templates (template_id, project_id, name, storage_key, filled_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [template.id, project_id, filledName, storageKey, req.user.id]
    );

    const filledTemplate = filledResult.rows[0];

    // Save filled values
    const placeholders = await query(
      'SELECT * FROM template_placeholders WHERE template_id = $1',
      [template.id]
    );

    for (const ph of placeholders.rows) {
      if (values[ph.placeholder_name] !== undefined) {
        await client.query(
          `INSERT INTO filled_template_values (filled_template_id, placeholder_id, value)
           VALUES ($1, $2, $3)`,
          [filledTemplate.id, ph.id, values[ph.placeholder_name]]
        );
      }
    }

    await client.query('COMMIT');

    // Generate download URL
    const downloadUrl = await getDownloadUrl(storageKey);

    res.status(201).json({
      filled_template: filledTemplate,
      download_url: downloadUrl,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Fill template error:', err);
    res.status(500).json({ error: 'Failed to fill template' });
  } finally {
    client.release();
  }
});

// GET /api/templates/:id/download - download original template
router.get('/:id/download', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT storage_key, name FROM templates WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const url = await getDownloadUrl(result.rows[0].storage_key);
    res.json({ url, filename: result.rows[0].name });
  } catch (err) {
    console.error('Template download error:', err);
    res.status(500).json({ error: 'Failed to get download URL' });
  }
});

// DELETE /api/templates/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM templates WHERE id = $1 RETURNING id, storage_key',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ message: 'Template deleted' });
  } catch (err) {
    console.error('Delete template error:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

module.exports = router;
