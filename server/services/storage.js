const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client, BUCKET } = require('../config/s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

/**
 * Upload a file to S3
 * @param {Buffer} fileBuffer - File content
 * @param {string} originalName - Original filename
 * @param {string} mimeType - MIME type
 * @param {string} prefix - Key prefix (e.g., 'files/', 'templates/')
 * @returns {string} S3 storage key
 */
async function uploadFile(fileBuffer, originalName, mimeType, prefix = 'files/') {
  const ext = path.extname(originalName);
  const key = `${prefix}${uuidv4()}${ext}`;

  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  }));

  return key;
}

/**
 * Get a file from S3
 * @param {string} key - S3 storage key
 * @returns {Buffer} File content
 */
async function getFile(key) {
  const response = await s3Client.send(new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));

  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Generate a presigned download URL
 * @param {string} key - S3 storage key
 * @param {number} expiresIn - URL expiry in seconds (default 1 hour)
 * @returns {string} Presigned URL
 */
async function getDownloadUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete a file from S3
 * @param {string} key - S3 storage key
 */
async function deleteFile(key) {
  await s3Client.send(new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }));
}

/**
 * Check if a file exists in S3
 * @param {string} key - S3 storage key
 * @returns {boolean}
 */
async function fileExists(key) {
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }));
    return true;
  } catch {
    return false;
  }
}

module.exports = { uploadFile, getFile, getDownloadUrl, deleteFile, fileExists };
