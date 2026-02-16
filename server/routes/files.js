const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { query, getClient } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { uploadFile, getFile, getDownloadUrl, deleteFile } = require('../services/storage');
const { analyzeFile, analyzeTextContent } = require('../services/ai');
const { getDocxText } = require('../services/docx');

const router = express.Router();

// Multer config: store in memory for S3 upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

// GET /api/files?project_id=X&folder_id=Y&label_id=Z - list files with filters
router.get('/', requireAuth, async (req, res) => {
  try {
    const { project_id, folder_id, label_id, ai_analyzed } = req.query;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    let sql = `
      SELECT f.*, u.name AS uploaded_by_name,
             fld.name AS folder_name, fld.path AS folder_path,
             COALESCE(
               json_agg(
                 json_build_object('id', l.id, 'name', l.name, 'color', l.color, 'assigned_by', fl.assigned_by)
               ) FILTER (WHERE l.id IS NOT NULL), '[]'
             ) AS labels
      FROM files f
      JOIN users u ON u.id = f.uploaded_by
      LEFT JOIN folders fld ON fld.id = f.folder_id
      LEFT JOIN file_labels fl ON fl.file_id = f.id
      LEFT JOIN labels l ON l.id = fl.label_id
      WHERE f.project_id = $1
    `;
    const params = [project_id];
    let paramIdx = 2;

    if (folder_id) {
      sql += ` AND f.folder_id = $${paramIdx}`;
      params.push(folder_id);
      paramIdx++;
    }

    if (label_id) {
      sql += ` AND EXISTS (SELECT 1 FROM file_labels fl2 WHERE fl2.file_id = f.id AND fl2.label_id = $${paramIdx})`;
      params.push(label_id);
      paramIdx++;
    }

    if (ai_analyzed !== undefined) {
      sql += ` AND f.ai_analyzed = $${paramIdx}`;
      params.push(ai_analyzed === 'true');
      paramIdx++;
    }

    sql += ` GROUP BY f.id, u.name, fld.name, fld.path ORDER BY f.created_at DESC`;

    const result = await query(sql, params);
    res.json({ files: result.rows });
  } catch (err) {
    console.error('List files error:', err);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// POST /api/files/upload - upload file(s) with auto AI analysis
router.post('/upload', requireAuth, upload.array('files', 20), async (req, res) => {
  const client = await getClient();
  try {
    const { project_id, folder_id } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    await client.query('BEGIN');

    const uploadedFiles = [];

    for (const file of req.files) {
      // Upload to S3
      const storageKey = await uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        `projects/${project_id}/files/`
      );

      // Save file record
      const fileResult = await client.query(
        `INSERT INTO files (project_id, folder_id, original_name, storage_key, mime_type, file_size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [project_id, folder_id || null, file.originalname, storageKey, file.mimetype, file.size, req.user.id]
      );

      uploadedFiles.push(fileResult.rows[0]);
    }

    await client.query('COMMIT');

    // Trigger AI analysis asynchronously (non-blocking)
    for (const uploadedFile of uploadedFiles) {
      const originalFile = req.files.find(f => f.originalname === uploadedFile.original_name);
      if (originalFile) {
        processAIAnalysis(uploadedFile, originalFile.buffer, originalFile.mimetype, project_id)
          .catch(err => console.error(`AI analysis failed for ${uploadedFile.id}:`, err));
      }
    }

    res.status(201).json({ files: uploadedFiles, message: 'Files uploaded. AI analysis in progress.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload files' });
  } finally {
    client.release();
  }
});

// Async AI analysis processor
async function processAIAnalysis(fileRecord, fileBuffer, mimeType, projectId) {
  let analysis;

  if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
    // Use vision for images/PDFs
    if (mimeType === 'application/pdf') {
      try {
        const pdfData = await pdfParse(fileBuffer);
        analysis = await analyzeTextContent(pdfData.text, fileRecord.original_name, projectId);
      } catch {
        // If PDF text extraction fails, try with vision
        analysis = await analyzeFile(fileBuffer, fileRecord.original_name, mimeType, projectId);
      }
    } else {
      analysis = await analyzeFile(fileBuffer, fileRecord.original_name, mimeType, projectId);
    }
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    // Extract text from Word docs
    try {
      const text = getDocxText(fileBuffer);
      analysis = await analyzeTextContent(text, fileRecord.original_name, projectId);
    } catch {
      analysis = { summary: 'Could not extract text from document', suggested_labels: [], confidence: 0 };
    }
  } else if (mimeType.startsWith('text/')) {
    const text = fileBuffer.toString('utf-8');
    analysis = await analyzeTextContent(text, fileRecord.original_name, projectId);
  } else {
    analysis = {
      summary: `File type ${mimeType} - analysis based on filename only`,
      suggested_labels: [],
      suggested_folder_id: null,
      confidence: 0.3,
    };
  }

  // Update file with AI results
  await query(
    `UPDATE files SET ai_analyzed = TRUE, ai_summary = $1,
     ai_suggested_folder = $2, ai_confidence = $3, updated_at = NOW()
     WHERE id = $4`,
    [
      analysis.summary,
      analysis.suggested_folder_id || null,
      analysis.confidence || 0,
      fileRecord.id,
    ]
  );

  // Auto-assign suggested labels
  if (analysis.suggested_labels && analysis.suggested_labels.length > 0) {
    for (const labelName of analysis.suggested_labels) {
      const labelResult = await query(
        `SELECT id FROM labels WHERE name = $1 AND (is_predefined = TRUE OR project_id = $2)`,
        [labelName, projectId]
      );

      if (labelResult.rows.length > 0) {
        await query(
          `INSERT INTO file_labels (file_id, label_id, assigned_by, confidence)
           VALUES ($1, $2, 'ai', $3)
           ON CONFLICT (file_id, label_id) DO NOTHING`,
          [fileRecord.id, labelResult.rows[0].id, analysis.confidence || 0.5]
        );
      }
    }
  }

  // Auto-move to suggested folder if high confidence
  if (analysis.suggested_folder_id && analysis.confidence >= 0.8) {
    await query(
      `UPDATE files SET folder_id = $1, updated_at = NOW() WHERE id = $2`,
      [analysis.suggested_folder_id, fileRecord.id]
    );
  }
}

// GET /api/files/:id - get file details
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT f.*, u.name AS uploaded_by_name,
              fld.name AS folder_name, fld.path AS folder_path
       FROM files f
       JOIN users u ON u.id = f.uploaded_by
       LEFT JOIN folders fld ON fld.id = f.folder_id
       WHERE f.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get labels
    const labels = await query(
      `SELECT l.id, l.name, l.color, fl.assigned_by, fl.confidence
       FROM file_labels fl
       JOIN labels l ON l.id = fl.label_id
       WHERE fl.file_id = $1`,
      [req.params.id]
    );

    const file = result.rows[0];
    file.labels = labels.rows;

    res.json({ file });
  } catch (err) {
    console.error('Get file error:', err);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

// GET /api/files/:id/download - get download URL
router.get('/:id/download', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT storage_key, original_name FROM files WHERE id = $1', [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const url = await getDownloadUrl(result.rows[0].storage_key);
    res.json({ url, filename: result.rows[0].original_name });
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Failed to get download URL' });
  }
});

// PUT /api/files/:id - update file metadata (move, rename)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { folder_id, original_name } = req.body;

    const result = await query(
      `UPDATE files SET
        folder_id = COALESCE($1, folder_id),
        original_name = COALESCE($2, original_name),
        updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [folder_id, original_name, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({ file: result.rows[0] });
  } catch (err) {
    console.error('Update file error:', err);
    res.status(500).json({ error: 'Failed to update file' });
  }
});

// POST /api/files/:id/reanalyze - trigger AI re-analysis
router.post('/:id/reanalyze', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM files WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];
    const fileBuffer = await getFile(file.storage_key);

    // Run analysis (async)
    processAIAnalysis(file, fileBuffer, file.mime_type, file.project_id)
      .catch(err => console.error(`Re-analysis failed for ${file.id}:`, err));

    res.json({ message: 'Re-analysis started' });
  } catch (err) {
    console.error('Reanalyze error:', err);
    res.status(500).json({ error: 'Failed to start re-analysis' });
  }
});

// DELETE /api/files/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM files WHERE id = $1 RETURNING storage_key',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete from S3
    await deleteFile(result.rows[0].storage_key).catch(err =>
      console.error('S3 delete error:', err)
    );

    res.json({ message: 'File deleted' });
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
