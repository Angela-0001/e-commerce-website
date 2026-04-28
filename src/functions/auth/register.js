'use strict';

const { CognitoIdentityProviderClient, SignUpCommand, AdminAddUserToGroupCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { requireFields } = require('/opt/validate');
const { AppError, ConflictError, ValidationError } = require('/opt/errors');
const response = require('/opt/response');

const cognito = new CognitoIdentityProviderClient({});

const COGNITO_ERROR_MAP = {
  UsernameExistsException: (msg) => new ConflictError(msg),
  InvalidPasswordException: (msg) => new ValidationError(msg),
};

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    requireFields(body, ['email', 'password', 'name']);
    const { email, password, name, phoneNumber } = body;

    await cognito.send(new SignUpCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'name', Value: name },
        { Name: 'email', Value: email },
        ...(phoneNumber ? [{ Name: 'phone_number', Value: phoneNumber }] : []),
      ],
    }));

    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: email,
      GroupName: 'Customer',
    }));

    return response.success(201, { message: 'Registration successful. Please check your email to verify your account.' });
  } catch (err) {
    if (err instanceof AppError) return response.error(err.statusCode, err.message);
    const mapper = COGNITO_ERROR_MAP[err.name];
    if (mapper) { const mapped = mapper(err.message); return response.error(mapped.statusCode, mapped.message); }
    console.error('register error:', err);
    return response.error(500, 'Internal server error');
  }
};
