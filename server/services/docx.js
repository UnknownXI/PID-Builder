const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');

/**
 * Extract <<PLACEHOLDER>> names from a Word document
 * @param {Buffer} docxBuffer - .docx file buffer
 * @returns {string[]} Array of placeholder names (without delimiters)
 */
function extractPlaceholders(docxBuffer) {
  const zip = new PizZip(docxBuffer);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '<<', end: '>>' },
    paragraphLoop: true,
    linebreaks: true,
    // Use a custom parser to extract tags without throwing on missing data
    nullGetter: () => '',
  });

  // Get all tags/placeholders from the template
  const tags = doc.getFullText();
  const placeholderRegex = /<<([^>]+)>>/g;

  // Also scan the raw XML for placeholders (handles split runs)
  const rawXml = zip.files['word/document.xml']
    ? zip.files['word/document.xml'].asText()
    : '';

  const found = new Set();
  let match;

  // Search in full text
  while ((match = placeholderRegex.exec(tags)) !== null) {
    found.add(match[1].trim());
  }

  // Search in raw XML (placeholders might be split across XML tags)
  // First, strip XML tags to get clean text runs
  const cleanText = rawXml.replace(/<[^>]+>/g, '');
  while ((match = placeholderRegex.exec(cleanText)) !== null) {
    found.add(match[1].trim());
  }

  return Array.from(found);
}

/**
 * Fill a Word template with provided data
 * @param {Buffer} docxBuffer - .docx template file buffer
 * @param {Object} data - Key-value pairs to fill, e.g., { PROJECT_NAME: 'My Project' }
 * @returns {Buffer} Filled .docx file buffer
 */
function fillTemplate(docxBuffer, data) {
  const zip = new PizZip(docxBuffer);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '<<', end: '>>' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: (part) => {
      // Return placeholder name if value not provided
      if (!part.module) {
        return `<<${part.value}>>`;
      }
      return '';
    },
  });

  doc.render(data);

  const buf = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });

  return buf;
}

/**
 * Get the full text content of a Word document
 * @param {Buffer} docxBuffer - .docx file buffer
 * @returns {string} Full text content
 */
function getDocxText(docxBuffer) {
  const zip = new PizZip(docxBuffer);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '<<', end: '>>' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  return doc.getFullText();
}

module.exports = { extractPlaceholders, fillTemplate, getDocxText };
