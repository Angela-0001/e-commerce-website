'use strict';

const { extractClaims } = require('/opt/auth');
const dynamo = require('/opt/dynamo');
const { validatePhone } = require('/opt/validate');
const { AppError } = require('/opt/errors');
const response = require('/opt/response');

const TABLE_NAME = process.env.USERS_TABLE;

const ALLOWED_FIELDS = ['name', 'phoneNumber', 'address'];

exports.handler = async (event) => {
  try {
    const { userId } = extractClaims(event);

    const body = JSON.parse(event.body || '{}');

    if (body.phoneNumber !== undefined) {
      validatePhone(body.phoneNumber);
    }

    // Build UpdateExpression dynamically for allowed fields only
    const expressionParts = [];
    const expressionNames = {};
    const expressionValues = {};

    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) {
        expressionParts.push(`#${field} = :${field}`);
        expressionNames[`#${field}`] = field;
        expressionValues[`:${field}`] = body[field];
      }
    }

    // Always update updatedAt
    expressionParts.push('#updatedAt = :updatedAt');
    expressionNames['#updatedAt'] = 'updatedAt';
    expressionValues[':updatedAt'] = new Date().toISOString();

    const result = await dynamo.getClient().update({
      TableName: TABLE_NAME,
      Key: { userId },
      UpdateExpression: `SET ${expressionParts.join(', ')}`,
      ExpressionAttributeNames: expressionNames,
      ExpressionAttributeValues: expressionValues,
      ReturnValues: 'ALL_NEW',
    }).promise();

    return response.success(200, result.Attributes);
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in updateProfile:', err);
    return response.error(500, 'Internal server error');
  }
};
