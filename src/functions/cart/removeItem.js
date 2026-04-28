'use strict';

const { extractClaims } = require('/opt/auth');
const dynamo = require('/opt/dynamo');
const { AppError } = require('/opt/errors');
const response = require('/opt/response');

const CARTS_TABLE = process.env.CARTS_TABLE;

exports.handler = async (event) => {
  try {
    const { userId } = extractClaims(event);

    const { productId } = event.pathParameters || {};

    await dynamo.getClient().delete({
      TableName: CARTS_TABLE,
      Key: { userId, productId },
    }).promise();

    return {
      statusCode: 204,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: '',
    };
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in removeItem:', err);
    return response.error(500, 'Internal server error');
  }
};
