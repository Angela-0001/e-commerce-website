'use strict';

const dynamo = require('/opt/dynamo');
const { AppError, ValidationError } = require('/opt/errors');
const { validatePriceRange } = require('/opt/validate');
const response = require('/opt/response');

const TABLE_NAME = process.env.PRODUCTS_TABLE;

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};

    // Parse and validate pageSize
    let pageSize = qs.pageSize !== undefined ? parseInt(qs.pageSize, 10) : 20;
    if (isNaN(pageSize) || pageSize <= 0) {
      throw new ValidationError('pageSize must be a positive integer');
    }
    if (pageSize > 100) pageSize = 100;

    // Validate price params
    const { minPrice, maxPrice, search, categoryId } = qs;
    validatePriceRange(minPrice, maxPrice);

    // Build FilterExpression
    let filterParts = ['isActive = :active'];
    const expressionAttributeValues = { ':active': true };
    const expressionAttributeNames = {};

    if (search) {
      filterParts.push('(contains(#name, :search) OR contains(#categoryId, :search))');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeNames['#categoryId'] = 'categoryId';
      expressionAttributeValues[':search'] = search;
    }

    if (categoryId) {
      filterParts.push('categoryId = :categoryId');
      expressionAttributeValues[':categoryId'] = categoryId;
    }

    if (minPrice !== undefined) {
      filterParts.push('price >= :minPrice');
      expressionAttributeValues[':minPrice'] = Number(minPrice);
    }

    if (maxPrice !== undefined) {
      filterParts.push('price <= :maxPrice');
      expressionAttributeValues[':maxPrice'] = Number(maxPrice);
    }

    const params = {
      TableName: TABLE_NAME,
      FilterExpression: filterParts.join(' AND '),
      ExpressionAttributeValues: expressionAttributeValues,
      Limit: pageSize,
    };

    if (Object.keys(expressionAttributeNames).length > 0) {
      params.ExpressionAttributeNames = expressionAttributeNames;
    }

    // Decode nextToken cursor
    if (qs.nextToken) {
      try {
        params.ExclusiveStartKey = JSON.parse(
          Buffer.from(qs.nextToken, 'base64').toString('utf8')
        );
      } catch {
        throw new ValidationError('Invalid nextToken');
      }
    }

    const result = await dynamo.getClient().scan(params).promise();

    const responseBody = { products: result.Items || [] };

    if (result.LastEvaluatedKey) {
      responseBody.nextToken = Buffer.from(
        JSON.stringify(result.LastEvaluatedKey)
      ).toString('base64');
    }

    return response.success(200, responseBody);
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in listProducts:', err);
    return response.error(500, 'Internal server error');
  }
};
