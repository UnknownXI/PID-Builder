const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Use local filesystem for storage (swap to S3 in production)
const STORAGE_ROOT = process.env.STORAGE_PATH || path.join(__dirname, '..', '..', 'uploads');

// Ensure storage directory exists
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Upload a file to local storage
 * @param {Buffer} fileBuffer - File content
 * @param {string} originalName - Original filename
 * @param {string} mimeType - MIME type
 * @param {string} prefix - Key prefix (e.g., 'files/', 'templates/')
 * @returns {string} Storage key
 */
async function uploadFile(fileBuffer, originalName, mimeType, prefix = 'files/') {
  const ext = path.extname(originalName);
  const key = `${prefix}${uuidv4()}${ext}`;
  const fullPath = path.join(STORAGE_ROOT, key);

  ensureDir(path.dirname(fullPath));
  fs.writeFileSync(fullPath, fileBuffer);

  return key;
}

/**
 * Get a file from local storage
 * @param {string} key - Storage key
 * @returns {Buffer} File content
 */
async function getFile(key) {
  const fullPath = path.join(STORAGE_ROOT, key);
  return fs.readFileSync(fullPath);
}

/**
 * Generate a download URL (serves via /api/storage/ route)
 * @param {string} key - Storage key
 * @returns {string} Download URL path
 */
async function getDownloadUrl(key) {
  return `/api/storage/download?key=${encodeURIComponent(key)}`;
}

/**
 * Delete a file from local storage
 * @param {string} key - Storage key
 */
async function deleteFile(key) {
  const fullPath = path.join(STORAGE_ROOT, key);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

/**
 * Check if a file exists
 * @param {string} key - Storage key
 * @returns {boolean}
 */
async function fileExists(key) {
  return fs.existsSync(path.join(STORAGE_ROOT, key));
}

/**
 * Get the absolute path for a storage key (used by download route)
 */
function getAbsolutePath(key) {
  // Prevent path traversal
  const resolved = path.resolve(STORAGE_ROOT, key);
  if (!resolved.startsWith(path.resolve(STORAGE_ROOT))) {
    throw new Error('Invalid storage key');
  }
  return resolved;
}

module.exports = { uploadFile, getFile, getDownloadUrl, deleteFile, fileExists, getAbsolutePath, STORAGE_ROOT };
