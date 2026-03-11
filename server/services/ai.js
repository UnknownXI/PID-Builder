const Anthropic = require('@anthropic-ai/sdk');
const { query } = require('../config/database');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Analyze a file using Claude to determine its content type and suggest labels/folders
 * @param {Buffer} fileBuffer - File content
 * @param {string} fileName - Original filename
 * @param {string} mimeType - MIME type
 * @param {string} projectId - Project ID for context
 * @returns {Object} AI analysis results
 */
async function analyzeFile(fileBuffer, fileName, mimeType, projectId) {
  // Get existing labels for context
  const labelsResult = await query(
    `SELECT name FROM labels WHERE is_predefined = TRUE OR project_id = $1`,
    [projectId]
  );
  const availableLabels = labelsResult.rows.map(r => r.name);

  // Get existing folders for context
  const foldersResult = await query(
    `SELECT id, name, path FROM folders WHERE project_id = $1 ORDER BY path`,
    [projectId]
  );
  const availableFolders = foldersResult.rows.map(r => ({
    id: r.id,
    name: r.name,
    path: r.path,
  }));

  // Build the message content based on file type
  const content = [];

  if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
    // For images and PDFs, use vision capability
    const mediaType = mimeType === 'application/pdf' ? 'application/pdf' : mimeType;
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: fileBuffer.toString('base64'),
      },
    });
  }

  content.push({
    type: 'text',
    text: `Analyze this engineering/industrial document and provide:
1. A brief summary of what this document contains (2-3 sentences)
2. Suggested labels from this list: ${JSON.stringify(availableLabels)}
3. The most appropriate folder from these options: ${JSON.stringify(availableFolders)}

File name: "${fileName}"
File type: ${mimeType}

Respond in this exact JSON format:
{
  "summary": "Brief description of document content",
  "suggested_labels": ["Label1", "Label2"],
  "suggested_folder_id": "folder-uuid-here or null",
  "confidence": 0.85,
  "document_type": "PID|Isometric|Datasheet|Specification|Drawing|Report|Other"
}`,
  });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    });

    const responseText = response.content[0].text;

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {
      summary: responseText,
      suggested_labels: [],
      suggested_folder_id: null,
      confidence: 0.5,
      document_type: 'Other',
    };
  } catch (err) {
    console.error('AI analysis error:', err);
    return {
      summary: 'AI analysis failed',
      suggested_labels: [],
      suggested_folder_id: null,
      confidence: 0,
      document_type: 'Other',
      error: err.message,
    };
  }
}

/**
 * Analyze a text-based file (extract text first, then analyze)
 * @param {string} textContent - Extracted text content
 * @param {string} fileName - Original filename
 * @param {string} projectId - Project ID
 * @returns {Object} AI analysis results
 */
async function analyzeTextContent(textContent, fileName, projectId) {
  const labelsResult = await query(
    `SELECT name FROM labels WHERE is_predefined = TRUE OR project_id = $1`,
    [projectId]
  );
  const availableLabels = labelsResult.rows.map(r => r.name);

  const foldersResult = await query(
    `SELECT id, name, path FROM folders WHERE project_id = $1 ORDER BY path`,
    [projectId]
  );
  const availableFolders = foldersResult.rows.map(r => ({
    id: r.id,
    name: r.name,
    path: r.path,
  }));

  // Truncate very long text
  const truncated = textContent.length > 10000
    ? textContent.substring(0, 10000) + '\n...[truncated]'
    : textContent;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Analyze this engineering/industrial document and provide:
1. A brief summary of what this document contains (2-3 sentences)
2. Suggested labels from this list: ${JSON.stringify(availableLabels)}
3. The most appropriate folder from these options: ${JSON.stringify(availableFolders)}

File name: "${fileName}"
Document content:
---
${truncated}
---

Respond in this exact JSON format:
{
  "summary": "Brief description of document content",
  "suggested_labels": ["Label1", "Label2"],
  "suggested_folder_id": "folder-uuid-here or null",
  "confidence": 0.85,
  "document_type": "PID|Isometric|Datasheet|Specification|Drawing|Report|Other"
}`,
      }],
    });

    const responseText = response.content[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {
      summary: responseText,
      suggested_labels: [],
      suggested_folder_id: null,
      confidence: 0.5,
      document_type: 'Other',
    };
  } catch (err) {
    console.error('AI text analysis error:', err);
    return {
      summary: 'AI analysis failed',
      suggested_labels: [],
      suggested_folder_id: null,
      confidence: 0,
      document_type: 'Other',
      error: err.message,
    };
  }
}

module.exports = { analyzeFile, analyzeTextContent };
