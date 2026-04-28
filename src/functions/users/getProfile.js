'use strict';

const { extractClaims } = require('/opt/auth');
const dynamo = require('/opt/dynamo');
const { AppError, NotFoundError } = require('/opt/errors');
const response = require('/opt/response');

const TABLE_NAME = process.env.USERS_TABLE;

exports.handler = async (event) => {
  try {
    const { userId } = extractClaims(event);

    const result = await dynamo.getClient().get({
      TableName: TABLE_NAME,
      Key: { userId },
    }).promise();

    if (!result.Item) {
      throw new NotFoundError('User profile not found');
    }

    return response.success(200, result.Item);
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in getProfile:', err);
    return response.error(500, 'Internal server error');
  }
};
