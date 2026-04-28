'use strict';

const { CognitoIdentityProviderClient, ConfirmForgotPasswordCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { requireFields } = require('/opt/validate');
const { AppError, ValidationError } = require('/opt/errors');
const response = require('/opt/response');

const cognito = new CognitoIdentityProviderClient({});

const COGNITO_ERROR_MAP = {
  CodeMismatchException: (msg) => new ValidationError(msg),
  ExpiredCodeException: (msg) => new ValidationError(msg),
};

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    requireFields(body, ['email', 'code', 'newPassword']);
    const { email, code, newPassword } = body;

    await cognito.send(new ConfirmForgotPasswordCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
    }));

    return response.success(200, { message: 'Password reset successfully.' });
  } catch (err) {
    if (err instanceof AppError) return response.error(err.statusCode, err.message);
    const mapper = COGNITO_ERROR_MAP[err.name];
    if (mapper) { const mapped = mapper(err.message); return response.error(mapped.statusCode, mapped.message); }
    console.error('confirmPassword error:', err);
    return response.error(500, 'Internal server error');
  }
};
