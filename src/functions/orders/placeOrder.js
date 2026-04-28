'use strict';

const { randomUUID } = require('crypto');
const { extractClaims } = require('/opt/auth');
const dynamo = require('/opt/dynamo');
const { AppError, ValidationError, ConflictError } = require('/opt/errors');
const response = require('/opt/response');

const USERS_TABLE = process.env.USERS_TABLE;
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE;
const CARTS_TABLE = process.env.CARTS_TABLE;
const ORDERS_TABLE = process.env.ORDERS_TABLE;
const ORDER_ITEMS_TABLE = process.env.ORDER_ITEMS_TABLE;

exports.handler = async (event) => {
  try {
    const { userId } = extractClaims(event);

    // 1. Query cart items for this user
    const cartResult = await dynamo.getClient().query({
      TableName: CARTS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
    }).promise();

    const cartItems = cartResult.Items || [];
    if (cartItems.length === 0) {
      throw new ValidationError('Cart is empty');
    }

    // 2. Batch-get all products for cart items
    const productKeys = cartItems.map((item) => ({ productId: item.productId }));
    const batchResult = await dynamo.getClient().batchGet({
      RequestItems: {
        [PRODUCTS_TABLE]: { Keys: productKeys },
      },
    }).promise();

    const products = (batchResult.Responses[PRODUCTS_TABLE] || []).reduce((acc, p) => {
      acc[p.productId] = p;
      return acc;
    }, {});

    // 3. Pre-transaction stock validation
    const outOfStockIds = cartItems
      .filter((item) => {
        const product = products[item.productId];
        return !product || item.quantity > product.stockQuantity;
      })
      .map((item) => item.productId);

    if (outOfStockIds.length > 0) {
      return response.error(409, `Insufficient stock for products: ${outOfStockIds.join(', ')}`);
    }

    // 4. Get user profile for delivery address
    const userResult = await dynamo.getClient().get({
      TableName: USERS_TABLE,
      Key: { userId },
    }).promise();

    const deliveryAddress = (userResult.Item && userResult.Item.address) || null;

    // 5. Build order metadata
    const orderId = randomUUID();
    const now = new Date().toISOString();
    const status = 'Pending';

    const totalAmount = cartItems.reduce((sum, item) => {
      const product = products[item.productId];
      return sum + (product.price * item.quantity);
    }, 0);

    // 6. Build transactWrite items
    const transactItems = [];

    // Put: create order record
    transactItems.push({
      Put: {
        TableName: ORDERS_TABLE,
        Item: {
          orderId,
          userId,
          status,
          totalAmount,
          deliveryAddress,
          createdAt: now,
          updatedAt: now,
        },
      },
    });

    // Put: create each OrderItem record
    for (const item of cartItems) {
      const product = products[item.productId];
      const lineTotal = product.price * item.quantity;
      transactItems.push({
        Put: {
          TableName: ORDER_ITEMS_TABLE,
          Item: {
            orderId,
            productId: item.productId,
            productName: product.name,
            unitPrice: product.price,
            quantity: item.quantity,
            lineTotal,
          },
        },
      });
    }

    // Update: decrement stockQuantity for each product
    for (const item of cartItems) {
      transactItems.push({
        Update: {
          TableName: PRODUCTS_TABLE,
          Key: { productId: item.productId },
          UpdateExpression: 'SET stockQuantity = stockQuantity - :qty',
          ConditionExpression: 'stockQuantity >= :qty',
          ExpressionAttributeValues: { ':qty': item.quantity },
        },
      });
    }

    // Delete: remove each cart item
    for (const item of cartItems) {
      transactItems.push({
        Delete: {
          TableName: CARTS_TABLE,
          Key: { userId, productId: item.productId },
        },
      });
    }

    // 7. Execute transaction
    try {
      await dynamo.getClient().transactWrite({ TransactItems: transactItems }).promise();
    } catch (txErr) {
      if (txErr.name === 'TransactionCanceledException' || txErr.code === 'TransactionCanceledException') {
        const reasons = txErr.cancellationReasons || [];
        const failedProductIds = cartItems
          .filter((item, idx) => {
            // Order items start after the 1 order Put, then N orderItem Puts
            // Stock updates start at index: 1 + cartItems.length
            const stockUpdateIdx = 1 + cartItems.length + idx;
            const reason = reasons[stockUpdateIdx];
            return reason && reason.Code === 'ConditionalCheckFailed';
          })
          .map((item) => item.productId);

        const ids = failedProductIds.length > 0 ? failedProductIds : cartItems.map((i) => i.productId);
        return response.error(409, `Insufficient stock for products: ${ids.join(', ')}`);
      }
      throw txErr;
    }

    // 8. Return 201
    return response.success(201, {
      orderId,
      status,
      totalAmount,
      itemCount: cartItems.length,
      createdAt: now,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in placeOrder:', err);
    return response.error(500, 'Internal server error');
  }
};
