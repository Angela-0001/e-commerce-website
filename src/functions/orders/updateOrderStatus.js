'use strict';

const { requireAdmin } = require('/opt/auth');
const dynamo = require('/opt/dynamo');
const { AppError, NotFoundError, ValidationError } = require('/opt/errors');
const response = require('/opt/response');

const ORDERS_TABLE = process.env.ORDERS_TABLE;

const VALID_TRANSITIONS = {
  Pending: 'Processing',
  Processing: 'Shipped',
  Shipped: 'Delivered',
};

exports.handler = async (event) => {
  try {
    requireAdmin(event);

    const orderId = event.pathParameters && event.pathParameters.orderId;
    const body = JSON.parse(event.body || '{}');
    const { status: newStatus } = body;

    const orderResult = await dynamo.getClient().get({
      TableName: ORDERS_TABLE,
      Key: { orderId },
    }).promise();

    const order = orderResult.Item;
    if (!order) {
      throw new NotFoundError(`Order ${orderId} not found`);
    }

    const allowedNext = VALID_TRANSITIONS[order.status];
    if (!allowedNext || newStatus !== allowedNext) {
      const validMsg = allowedNext
        ? `Valid transition from ${order.status} is to ${allowedNext}`
        : `No further transitions allowed from status ${order.status}`;
      throw new ValidationError(`Invalid status transition: ${order.status} → ${newStatus}. ${validMsg}`);
    }

    const now = new Date().toISOString();

    await dynamo.getClient().update({
      TableName: ORDERS_TABLE,
      Key: { orderId },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': newStatus, ':updatedAt': now },
    }).promise();

    return response.success(200, {
      orderId: order.orderId,
      userId: order.userId,
      status: newStatus,
      totalAmount: order.totalAmount,
      deliveryAddress: order.deliveryAddress,
      createdAt: order.createdAt,
      updatedAt: now,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in updateOrderStatus:', err);
    return response.error(500, 'Internal server error');
  }
};
