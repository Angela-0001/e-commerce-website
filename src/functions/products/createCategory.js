'use strict';

const { requireAdmin } = require('/opt/auth');
const dynamo = require('/opt/dynamo');
const { AppError } = require('/opt/errors');
const { requireFields } = require('/opt/validate');
const response = require('/opt/response');
const { randomUUID } = require('crypto');

const TABLE_NAME = process.env.CATEGORIES_TABLE;

exports.handler = async (event) => {
  try {
    requireAdmin(event);

    const body = JSON.parse(event.body || '{}');
    requireFields(body, ['name']);

    const categoryId = randomUUID();
    const createdAt = new Date().toISOString();

    const item = {
      categoryId,
      name: body.name,
      isActive: true,
      createdAt,
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
    console.error('Unhandled error in createCategory:', err);
    return response.error(500, 'Internal server error');
  }
};
