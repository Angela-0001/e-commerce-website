'use strict';

const { CognitoIdentityProviderClient, ForgotPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { requireFields } = require('/opt/validate');
const { AppError } = require('/opt/errors');
const response = require('/opt/response');

const cognito = new CognitoIdentityProviderClient({});

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    requireFields(body, ['email']);
    const { email } = body;

    try {
      await cognito.send(new ForgotPasswordCommand({
        ClientId: process.env.COGNITO_CLIENT_ID,
        Username: email,
      }));
    } catch (cognitoErr) {
      console.info('forgotPassword suppressed:', cognitoErr.name);
    }

    return response.success(200, { message: 'If an account with that email exists, a password reset code has been sent.' });
  } catch (err) {
    if (err instanceof AppError) return response.error(err.statusCode, err.message);
    console.error('forgotPassword error:', err);
    return response.error(500, 'Internal server error');
  }
};
