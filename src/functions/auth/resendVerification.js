'use strict';

const { CognitoIdentityProviderClient, ResendConfirmationCodeCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { requireFields } = require('/opt/validate');
const { AppError } = require('/opt/errors');
const response = require('/opt/response');

const cognito = new CognitoIdentityProviderClient({});

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    requireFields(body, ['email']);
    const { email } = body;

    await cognito.send(new ResendConfirmationCodeCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: email,
    }));

    return response.success(200, { message: 'Verification code resent. Please check your email.' });
  } catch (err) {
    if (err instanceof AppError) return response.error(err.statusCode, err.message);
    console.error('resendVerification error:', err);
    return response.error(500, 'Internal server error');
  }
};
