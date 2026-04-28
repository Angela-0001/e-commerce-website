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

    const { productId } = event.pathParameters || {};
    if (!productId) {
      throw new ValidationError('productId path parameter is required');
    }

    const body = JSON.parse(event.body || '{}');
    const { quantity } = body;

    if (quantity === undefined || quantity === null) {
      throw new ValidationError('quantity is required');
    }

    // If quantity <= 0, delete the cart item
    if (quantity <= 0) {
      await dynamo.getClient().delete({
        TableName: CARTS_TABLE,
        Key: { userId, productId },
      }).promise();
      return response.success(200, { message: 'Item removed from cart' });
    }

    // Validate product exists and is active
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

    // Update quantity in DynamoDB
    const updateResult = await dynamo.getClient().update({
      TableName: CARTS_TABLE,
      Key: { userId, productId },
      UpdateExpression: 'SET quantity = :qty',
      ExpressionAttributeValues: {
        ':qty': quantity,
      },
      ReturnValues: 'ALL_NEW',
    }).promise();

    return response.success(200, updateResult.Attributes);
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in updateItem:', err);
    return response.error(500, 'Internal server error');
  }
};
