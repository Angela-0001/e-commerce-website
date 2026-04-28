'use strict';

const { CognitoIdentityProviderClient, ConfirmSignUpCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { requireFields } = require('/opt/validate');
const { AppError, ValidationError } = require('/opt/errors');
const response = require('/opt/response');

const cognito = new CognitoIdentityProviderClient({});

const COGNITO_ERROR_MAP = {
  CodeMismatchException: (msg) => new ValidationError(msg),
  ExpiredCodeException: (msg) => new ValidationError(msg),
  NotAuthorizedException: (msg) => new AppError(401, msg),
  UserNotFoundException: (msg) => new AppError(404, msg),
};

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    requireFields(body, ['email', 'code']);
    const { email, code } = body;

    await cognito.send(new ConfirmSignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: email,
      ConfirmationCode: code,
    }));

    return response.success(200, { message: 'Email verified successfully.' });
  } catch (err) {
    if (err instanceof AppError) return response.error(err.statusCode, err.message);
    const mapper = COGNITO_ERROR_MAP[err.name];
    if (mapper) { const mapped = mapper(err.message); return response.error(mapped.statusCode, mapped.message); }
    console.error('verify error:', err);
    return response.error(500, 'Internal server error');
  }
};
