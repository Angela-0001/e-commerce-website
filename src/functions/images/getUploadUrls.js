'use strict';

const { S3Client } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { requireAdmin } = require('/opt/auth');
const { getClient } = require('/opt/dynamo');
const { AppError, NotFoundError, ValidationError } = require('/opt/errors');
const response = require('/opt/response');

const s3 = new S3Client({});
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE;
const BUCKET = process.env.PRODUCT_IMAGES_BUCKET;

exports.handler = async (event) => {
  try {
    requireAdmin(event);
    const { productId } = event.pathParameters || {};
    const body = JSON.parse(event.body || '{}');
    const { filenames } = body;

    if (!Array.isArray(filenames) || filenames.length === 0) {
      throw new ValidationError('filenames must be a non-empty array');
    }

    const result = await getClient().send(new GetCommand({
      TableName: PRODUCTS_TABLE,
      Key: { productId },
    }));

    if (!result.Item || result.Item.isActive === false) {
      throw new NotFoundError('Product not found');
    }

    const urls = await Promise.all(
      filenames.map(async (filename) => {
        const Key = `products/${productId}/${filename}`;
        const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key, ContentType: 'image/*' }), { expiresIn: 900 });
        return { filename, uploadUrl };
      })
    );

    return response.success(200, urls);
  } catch (err) {
    if (err instanceof AppError) return response.error(err.statusCode, err.message);
    console.error('getUploadUrls error:', err);
    return response.error(500, 'Internal server error');
  }
};
