'use strict';

const { requireAdmin } = require('/opt/auth');
const dynamo = require('/opt/dynamo');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { AppError, NotFoundError } = require('/opt/errors');
const response = require('/opt/response');

const TABLE_NAME = process.env.PRODUCTS_TABLE;
const BUCKET = process.env.PRODUCT_IMAGES_BUCKET;
const s3 = new S3Client({});

exports.handler = async (event) => {
  try {
    requireAdmin(event);
    const { productId } = event.pathParameters || {};

    const { Item: product } = await dynamo.getClient().get({
      TableName: TABLE_NAME,
      Key: { productId },
    }).promise();

    if (!product || !product.isActive) throw new NotFoundError('Product not found');

    // Delete S3 image if exists
    if (product.imageKey) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: product.imageKey }));
      } catch (e) { console.warn('Failed to delete image:', e.message); }
    }

    await dynamo.getClient().update({
      TableName: TABLE_NAME,
      Key: { productId },
      UpdateExpression: 'SET isActive = :inactive, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':inactive': false, ':updatedAt': new Date().toISOString() },
    }).promise();

    return response.success(204, null);
  } catch (err) {
    if (err instanceof AppError) return response.error(err.statusCode, err.message);
    console.error('deleteProduct error:', err);
    return response.error(500, 'Internal server error');
  }
};
