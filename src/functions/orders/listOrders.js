'use strict';

const { extractClaims } = require('/opt/auth');
const dynamo = require('/opt/dynamo');
const { AppError } = require('/opt/errors');
const response = require('/opt/response');

const ORDERS_TABLE = process.env.ORDERS_TABLE;

exports.handler = async (event) => {
  try {
    const { userId } = extractClaims(event);

    const qs = (event.queryStringParameters) || {};
    let pageSize = parseInt(qs.pageSize, 10) || 20;
    if (pageSize > 100) pageSize = 100;
    if (pageSize < 1) pageSize = 1;

    const params = {
      TableName: ORDERS_TABLE,
      IndexName: 'UserOrdersIndex',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      Limit: pageSize,
      ScanIndexForward: false,
    };

    if (qs.nextToken) {
      try {
        params.ExclusiveStartKey = JSON.parse(
          Buffer.from(qs.nextToken, 'base64').toString('utf8')
        );
      } catch (_) {
        // ignore invalid token
      }
    }

    const result = await dynamo.getClient().query(params).promise();

    const items = (result.Items || []).map((o) => ({
      orderId: o.orderId,
      createdAt: o.createdAt,
      totalAmount: o.totalAmount,
      status: o.status,
    }));

    const resp = { items };
    if (result.LastEvaluatedKey) {
      resp.nextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }

    return response.success(200, resp);
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in listOrders:', err);
    return response.error(500, 'Internal server error');
  }
};
