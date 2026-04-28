'use strict';

const { requireAdmin } = require('/opt/auth');
const dynamo = require('/opt/dynamo');
const { AppError, ValidationError } = require('/opt/errors');
const { requireFields, validatePrice, validateStock } = require('/opt/validate');
const response = require('/opt/response');
const { randomUUID } = require('crypto');

const TABLE_NAME = process.env.PRODUCTS_TABLE;

exports.handler = async (event) => {
  try {
    requireAdmin(event);

    const body = JSON.parse(event.body || '{}');
    requireFields(body, ['name', 'description', 'price', 'stockQuantity', 'categoryId']);

    validatePrice(body.price);
    validateStock(body.stockQuantity);

    const productId = randomUUID();
    const now = new Date().toISOString();

    const item = {
      productId,
      name: body.name,
      description: body.description,
      price: body.price,
      stockQuantity: body.stockQuantity,
      categoryId: body.categoryId,
      imageKeys: body.imageKeys || ['placeholder.jpg'],
      imageUrl: body.imageUrl || null,
      imageKey: body.imageKey || null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await dynamo.getClient().put({
      TableName: TABLE_NAME,
      Item: item,
    }).promise();

    return response.success(201, item);
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in createProduct:', err);
    return response.error(500, 'Internal server error');
  }
};
