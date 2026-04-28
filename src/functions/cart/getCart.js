'use strict';

const { extractClaims } = require('/opt/auth');
const dynamo = require('/opt/dynamo');
const { AppError } = require('/opt/errors');
const response = require('/opt/response');

const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE;
const CARTS_TABLE = process.env.CARTS_TABLE;

exports.handler = async (event) => {
  try {
    const { userId } = extractClaims(event);

    // Query all cart items for this user
    const cartResult = await dynamo.getClient().query({
      TableName: CARTS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    }).promise();

    const cartItems = cartResult.Items || [];

    if (cartItems.length === 0) {
      return response.success(200, { items: [], grandTotal: 0 });
    }

    // Batch-get product details for all cart items
    const keys = cartItems.map((item) => ({ productId: item.productId }));
    const batchResult = await dynamo.getClient().batchGet({
      RequestItems: {
        [PRODUCTS_TABLE]: { Keys: keys },
      },
    }).promise();

    const products = (batchResult.Responses[PRODUCTS_TABLE] || []).reduce((acc, p) => {
      acc[p.productId] = p;
      return acc;
    }, {});

    // Build enriched items with line totals
    const items = cartItems.map((item) => {
      const product = products[item.productId] || {};
      const unitPrice = product.price || 0;
      const quantity = item.quantity || 0;
      const lineTotal = unitPrice * quantity;
      return {
        productId: item.productId,
        productName: product.name || null,
        imageUrl: product.imageUrl || null,
        unitPrice,
        quantity,
        lineTotal,
      };
    });

    const grandTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

    return response.success(200, { items, grandTotal });
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in getCart:', err);
    return response.error(500, 'Internal server error');
  }
};
