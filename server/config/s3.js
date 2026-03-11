const { S3Client } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  forcePathStyle: true, // Required for MinIO / local S3
});

const BUCKET = process.env.S3_BUCKET || 'pid-builder';

module.exports = { s3Client, BUCKET };
