const express = require('express');
const { query } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/search?q=term&project_id=X&labels=id1,id2&type=file|template|all
router.get('/', requireAuth, async (req, res) => {
  try {
    const { q, project_id, labels, type, folder_id } = req.query;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    const results = { files: [], templates: [], filled_templates: [] };
    const searchType = type || 'all';

    // Search files
    if (searchType === 'all' || searchType === 'file') {
      let fileSql = `
        SELECT f.*, u.name AS uploaded_by_name,
               fld.name AS folder_name, fld.path AS folder_path,
               COALESCE(
                 json_agg(
                   json_build_object('id', l.id, 'name', l.name, 'color', l.color)
                 ) FILTER (WHERE l.id IS NOT NULL), '[]'
               ) AS labels
        FROM files f
        JOIN users u ON u.id = f.uploaded_by
        LEFT JOIN folders fld ON fld.id = f.folder_id
        LEFT JOIN file_labels fl ON fl.file_id = f.id
        LEFT JOIN labels l ON l.id = fl.label_id
        WHERE f.project_id = $1
      `;
      const fileParams = [project_id];
      let idx = 2;

      // Full-text search
      if (q) {
        fileSql += ` AND (f.search_vector @@ plainto_tsquery('english', $${idx})
                     OR f.original_name ILIKE $${idx + 1})`;
        fileParams.push(q, `%${q}%`);
        idx += 2;
      }

      // Filter by folder
      if (folder_id) {
        fileSql += ` AND f.folder_id = $${idx}`;
        fileParams.push(folder_id);
        idx++;
      }

      // Filter by labels
      if (labels) {
        const labelIds = labels.split(',');
        fileSql += ` AND EXISTS (
          SELECT 1 FROM file_labels fl2
          WHERE fl2.file_id = f.id AND fl2.label_id = ANY($${idx}::uuid[])
        )`;
        fileParams.push(labelIds);
        idx++;
      }

      fileSql += ` GROUP BY f.id, u.name, fld.name, fld.path ORDER BY f.created_at DESC LIMIT 50`;

      const fileResult = await query(fileSql, fileParams);
      results.files = fileResult.rows;
    }

    // Search templates
    if (searchType === 'all' || searchType === 'template') {
      let tmplSql = `
        SELECT t.*, u.name AS uploaded_by_name,
               (SELECT COUNT(*) FROM template_placeholders tp WHERE tp.template_id = t.id) AS placeholder_count
        FROM templates t
        JOIN users u ON u.id = t.uploaded_by
        WHERE t.project_id = $1
      `;
      const tmplParams = [project_id];
      let idx = 2;

      if (q) {
        tmplSql += ` AND (t.search_vector @@ plainto_tsquery('english', $${idx})
                     OR t.name ILIKE $${idx + 1})`;
        tmplParams.push(q, `%${q}%`);
        idx += 2;
      }

      tmplSql += ` ORDER BY t.created_at DESC LIMIT 50`;

      const tmplResult = await query(tmplSql, tmplParams);
      results.templates = tmplResult.rows;
    }

    // Search filled templates
    if (searchType === 'all' || searchType === 'filled') {
      let ftSql = `
        SELECT ft.*, t.name AS template_name, u.name AS filled_by_name
        FROM filled_templates ft
        JOIN templates t ON t.id = ft.template_id
        JOIN users u ON u.id = ft.filled_by
        WHERE ft.project_id = $1
      `;
      const ftParams = [project_id];
      let idx = 2;

      if (q) {
        ftSql += ` AND ft.name ILIKE $${idx}`;
        ftParams.push(`%${q}%`);
        idx++;
      }

      ftSql += ` ORDER BY ft.created_at DESC LIMIT 50`;

      const ftResult = await query(ftSql, ftParams);
      results.filled_templates = ftResult.rows;
    }

    res.json(results);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
