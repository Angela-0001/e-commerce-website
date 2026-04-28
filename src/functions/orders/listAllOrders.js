'use strict';

const { requireAdmin } = require('/opt/auth');
const dynamo = require('/opt/dynamo');
const { AppError } = require('/opt/errors');
const response = require('/opt/response');

const ORDERS_TABLE = process.env.ORDERS_TABLE;

exports.handler = async (event) => {
  try {
    requireAdmin(event);

    const qs = (event.queryStringParameters) || {};
    let pageSize = parseInt(qs.pageSize, 10) || 20;
    if (pageSize > 100) pageSize = 100;
    if (pageSize < 1) pageSize = 1;

    let exclusiveStartKey;
    if (qs.nextToken) {
      try {
        exclusiveStartKey = JSON.parse(
          Buffer.from(qs.nextToken, 'base64').toString('utf8')
        );
      } catch (_) {
        // ignore invalid token
      }
    }

    let result;

    if (qs.status) {
      const params = {
        TableName: ORDERS_TABLE,
        IndexName: 'StatusIndex',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': qs.status },
        Limit: pageSize,
        ScanIndexForward: false,
      };
      if (exclusiveStartKey) params.ExclusiveStartKey = exclusiveStartKey;
      result = await dynamo.getClient().query(params).promise();
    } else {
      const params = {
        TableName: ORDERS_TABLE,
        Limit: pageSize,
      };
      if (exclusiveStartKey) params.ExclusiveStartKey = exclusiveStartKey;
      result = await dynamo.getClient().scan(params).promise();
    }

    const resp = { items: result.Items || [] };
    if (result.LastEvaluatedKey) {
      resp.nextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }

    return response.success(200, resp);
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in listAllOrders:', err);
    return response.error(500, 'Internal server error');
  }
};
