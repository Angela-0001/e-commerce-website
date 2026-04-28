'use strict';

const dynamo = require('/opt/dynamo');
const { AppError, NotFoundError } = require('/opt/errors');
const response = require('/opt/response');

const TABLE_NAME = process.env.PRODUCTS_TABLE;

exports.handler = async (event) => {
  try {
    const { productId } = event.pathParameters || {};

    const result = await dynamo.getClient().get({
      TableName: TABLE_NAME,
      Key: { productId },
    }).promise();

    const item = result.Item;

    if (!item || item.isActive === false) {
      throw new NotFoundError('Product not found');
    }

    return response.success(200, item);
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in getProduct:', err);
    return response.error(500, 'Internal server error');
  }
};
