'use strict';

const { extractClaims } = require('/opt/auth');
const dynamo = require('/opt/dynamo');
const { AppError, NotFoundError, ConflictError, ValidationError } = require('/opt/errors');
const response = require('/opt/response');

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE;
const CARTS_TABLE = process.env.CARTS_TABLE;

exports.handler = async (event) => {
  try {
    const { userId } = extractClaims(event);

    const body = JSON.parse(event.body || '{}');
    const { productId, quantity } = body;

    if (!productId) {
      throw new ValidationError('productId is required');
    }
    if (quantity === undefined || quantity === null) {
      throw new ValidationError('quantity is required');
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new ValidationError('quantity must be an integer >= 1');
    }

    // Get product from DynamoDB
    const productResult = await dynamo.getClient().get({
      TableName: PRODUCTS_TABLE,
      Key: { productId },
    }).promise();

    const product = productResult.Item;
    if (!product || product.isActive === false) {
      throw new NotFoundError('Product not found');
    }

    if (quantity > product.stockQuantity) {
      throw new ConflictError('Requested quantity exceeds available stock');
    }

    // Upsert cart item: ADD quantity if exists, else set quantity and addedAt
    const now = new Date().toISOString();
    const updateResult = await dynamo.getClient().update({
      TableName: CARTS_TABLE,
      Key: { userId, productId },
      UpdateExpression: 'ADD quantity :qty SET addedAt = if_not_exists(addedAt, :now)',
      ExpressionAttributeValues: {
        ':qty': quantity,
        ':now': now,
      },
      ReturnValues: 'ALL_NEW',
    }).promise();

    return response.success(200, updateResult.Attributes);
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in addItem:', err);
    return response.error(500, 'Internal server error');
  }
};
