'use strict';

const { requireAdmin } = require('/opt/auth');
const dynamo = require('/opt/dynamo');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { AppError, NotFoundError } = require('/opt/errors');
const { validatePrice, validateStock } = require('/opt/validate');
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

    const body = JSON.parse(event.body || '{}');
    if (body.price !== undefined) validatePrice(body.price);
    if (body.stockQuantity !== undefined) validateStock(body.stockQuantity);

    // Delete old S3 image if a new one is being set
    if (body.imageKey && product.imageKey && body.imageKey !== product.imageKey) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: product.imageKey }));
      } catch (e) { console.warn('Failed to delete old image:', e.message); }
    }

    const updatableFields = ['name', 'description', 'price', 'stockQuantity', 'categoryId', 'imageKeys', 'imageUrl', 'imageKey'];
    const expressionParts = [];
    const expressionNames = {};
    const expressionValues = {};

    for (const field of updatableFields) {
      if (body[field] !== undefined) {
        expressionParts.push(`#${field} = :${field}`);
        expressionNames[`#${field}`] = field;
        expressionValues[`:${field}`] = body[field];
      }
    }

    expressionParts.push('#updatedAt = :updatedAt');
    expressionNames['#updatedAt'] = 'updatedAt';
    expressionValues[':updatedAt'] = new Date().toISOString();

    const { Attributes: updated } = await dynamo.getClient().update({
      TableName: TABLE_NAME,
      Key: { productId },
      UpdateExpression: `SET ${expressionParts.join(', ')}`,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
      ReturnValues: 'ALL_NEW',
    }).promise();

    return response.success(200, updated);
  } catch (err) {
    if (err instanceof AppError) return response.error(err.statusCode, err.message);
    console.error('updateProduct error:', err);
    return response.error(500, 'Internal server error');
  }
};
