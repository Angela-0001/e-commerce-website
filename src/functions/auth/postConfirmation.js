'use strict';

const { getClient } = require('/opt/dynamo');

exports.handler = async (event) => {
  try {
    const attrs = event.request && event.request.userAttributes;
    const userId = (attrs && attrs.sub) || event.userName;
    const now = new Date().toISOString();

    await getClient().put({
      TableName: process.env.USERS_TABLE,
      Item: {
        userId,
        name: (attrs && attrs.name) || '',
        email: (attrs && attrs.email) || '',
        phoneNumber: (attrs && attrs.phone_number) || '',
        address: '',
        createdAt: now,
        updatedAt: now,
      },
    }).promise();

    return event;
  } catch (err) {
    console.error('postConfirmation error:', err);
    throw err;
  }
};
