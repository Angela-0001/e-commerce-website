'use strict';

const { requireAdmin } = require('/opt/auth');
const dynamo = require('/opt/dynamo');
const { AppError, NotFoundError, ConflictError } = require('/opt/errors');
const response = require('/opt/response');

const CATEGORIES_TABLE = process.env.CATEGORIES_TABLE;
const PRODUCTS_TABLE = process.env.PRODUCTS_TABLE;

exports.handler = async (event) => {
  try {
    requireAdmin(event);

    const { categoryId } = event.pathParameters || {};

    // Check category exists and is active
    const catResult = await dynamo.getClient().get({
      TableName: CATEGORIES_TABLE,
      Key: { categoryId },
    }).promise();

    if (!catResult.Item || !catResult.Item.isActive) {
      throw new NotFoundError('Category not found');
    }

    // Check for active products in this category via CategoryIndex
    const productsResult = await dynamo.getClient().query({
      TableName: PRODUCTS_TABLE,
      IndexName: 'CategoryIndex',
      KeyConditionExpression: 'categoryId = :cid',
      FilterExpression: 'isActive = :active',
      ExpressionAttributeValues: {
        ':cid': categoryId,
        ':active': true,
      },
      Limit: 1,
    }).promise();

    if (productsResult.Items && productsResult.Items.length > 0) {
      throw new ConflictError('Cannot delete category with active products');
    }

    // Soft-delete: set isActive = false
    await dynamo.getClient().update({
      TableName: CATEGORIES_TABLE,
      Key: { categoryId },
      UpdateExpression: 'SET isActive = :inactive',
      ExpressionAttributeValues: { ':inactive': false },
    }).promise();

    return response.success(204, {});
  } catch (err) {
    if (err instanceof AppError) {
      return response.error(err.statusCode, err.message);
    }
    console.error('Unhandled error in deleteCategory:', err);
    return response.error(500, 'Internal server error');
  }
};
