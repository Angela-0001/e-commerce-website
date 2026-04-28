'use strict';

const { extractClaims } = require('/opt/auth');
const dynamo = require('/opt/dynamo');
const { AppError, NotFoundError, ForbiddenError } = require('/opt/errors');
const response = require('/opt/response');

const ORDERS_TABLE = process.env.ORDERS_TABLE;
const ORDER_ITEMS_TABLE = process.env.ORDER_ITEMS_TABLE;

exports.handler = async (event) => {
  try {
    const { userId } = extractClaims(event);
    const orderId = event.pathParameters && event.pathParameters.orderId;

    const orderResult = await dynamo.getClient().get({
      TableName: ORDERS_TABLE,
      Key: { orderId },
    }).promise();

    const order = orderResult.Item;
    if (!order) {
      throw new NotFoundError(`Order ${orderId} not found`);
    }

    if (order.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    const itemsResult = await dynamo.getClient().query({
      TableName: ORDER_ITEMS_TABLE,
      KeyConditionExpression: 'orderId = :orderId',
      ExpressionAttributeValues: { ':orderId': orderId },
    }).promise();

    return response.success(200, {
      orderId: order.orderId,
      userId: order.userId,
      status: order.status,
      totalAmount: order.totalAmount,
      deliveryAddress: order.deliveryAddress,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      items: itemsResult.Items || [],
    });
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in getOrder:', err);
    return response.error(500, 'Internal server error');
  }
};
