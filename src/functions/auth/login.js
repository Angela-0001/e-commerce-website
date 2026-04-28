'use strict';

const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { requireFields } = require('/opt/validate');
const { AppError } = require('/opt/errors');
const response = require('/opt/response');

const cognito = new CognitoIdentityProviderClient({});

const COGNITO_ERROR_MAP = {
  NotAuthorizedException: () => new AppError(401, 'Invalid email or password.'),
  UserNotConfirmedException: () => new AppError(403, 'Email verification required. Please verify your account.'),
};

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    requireFields(body, ['email', 'password']);
    const { email, password } = body;

    const result = await cognito.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: process.env.COGNITO_CLIENT_ID,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }));

    const { AccessToken, IdToken, RefreshToken } = result.AuthenticationResult;

    return response.success(200, { tokens: { AccessToken, IdToken, RefreshToken } });
  } catch (err) {
    if (err instanceof AppError) return response.error(err.statusCode, err.message);
    const mapper = COGNITO_ERROR_MAP[err.name];
    if (mapper) { const mapped = mapper(); return response.error(mapped.statusCode, mapped.message); }
    console.error('login error:', err);
    return response.error(500, 'Internal server error');
  }
};
