'use strict';

const dynamo = require('/opt/dynamo');
const { AppError } = require('/opt/errors');
const response = require('/opt/response');

const TABLE_NAME = process.env.CATEGORIES_TABLE;

exports.handler = async (event) => {
  try {
    const result = await dynamo.getClient().scan({
      TableName: TABLE_NAME,
      FilterExpression: 'isActive = :active',
      ExpressionAttributeValues: { ':active': true },
    }).promise();

    return response.success(200, { categories: result.Items || [] });
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in listCategories:', err);
    return response.error(500, 'Internal server error');
  }
};
