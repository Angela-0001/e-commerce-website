'use strict';

const { S3Client } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { requireAdmin } = require('/opt/auth');
const { AppError, ValidationError } = require('/opt/errors');
const response = require('/opt/response');
const { randomUUID } = require('crypto');

const s3 = new S3Client({});
const BUCKET = process.env.PRODUCT_IMAGES_BUCKET;
const REGION = process.env.AWS_REGION || 'us-east-1';

exports.handler = async (event) => {
  try {
    requireAdmin(event);
    const body = JSON.parse(event.body || '{}');
    const { fileName, fileType } = body;

    if (!fileName || !fileType) throw new ValidationError('fileName and fileType are required');
    if (!fileType.startsWith('image/')) throw new ValidationError('fileType must be an image');

    const imageKey = `product-images/${randomUUID()}-${fileName}`;
    const imageUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${imageKey}`;

    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: BUCKET, Key: imageKey, ContentType: fileType }),
      { expiresIn: 300 }
    );

    return response.success(200, { uploadUrl, imageUrl, imageKey });
  } catch (err) {
    if (err instanceof AppError) return response.error(err.statusCode, err.message);
    console.error('getUploadUrl error:', err);
    return response.error(500, 'Internal server error');
  }
};
