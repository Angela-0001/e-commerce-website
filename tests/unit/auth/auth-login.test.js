'use strict';

// Virtual module mocks for the Lambda Layer paths
jest.mock('/opt/validate', () => require('../../../src/layer/validate'), { virtual: true });
jest.mock('/opt/errors', () => require('../../../src/layer/errors'), { virtual: true });
jest.mock('/opt/response', () => require('../../../src/layer/response'), { virtual: true });

function makeCognitoError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function makeEvent(body) {
  return { body: JSON.stringify(body) };
}

// ─── login.js ────────────────────────────────────────────────────────────────

describe('login handler', () => {
  const validBody = { email: 'user@example.com', password: 'Password1!' };

  let mockInitiateAuth;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.COGNITO_CLIENT_ID = 'test-client-id';

    mockInitiateAuth = jest.fn().mockReturnValue({
      promise: () => Promise.resolve({
        AuthenticationResult: {
          AccessToken: 'access-token-value',
          IdToken: 'id-token-value',
          RefreshToken: 'refresh-token-value',
        },
      }),
    });

    jest.doMock('aws-sdk', () => ({
      CognitoIdentityServiceProvider: jest.fn(() => ({
        initiateAuth: mockInitiateAuth,
      })),
    }));

    handler = require('../../../src/functions/auth/login').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns 200 with accessToken, idToken, refreshToken on valid login', async () => {
    const res = await handler(makeEvent(validBody));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBe('access-token-value');
    expect(body.idToken).toBe('id-token-value');
    expect(body.refreshToken).toBe('refresh-token-value');
  });

  test('calls initiateAuth with USER_PASSWORD_AUTH flow', async () => {
    await handler(makeEvent(validBody));
    expect(mockInitiateAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: expect.objectContaining({
          USERNAME: validBody.email,
          PASSWORD: validBody.password,
        }),
      })
    );
  });

  test('returns 401 for NotAuthorizedException', async () => {
    mockInitiateAuth.mockReturnValue({
      promise: () => Promise.reject(makeCognitoError('NotAuthorizedException', 'Incorrect username or password.')),
    });
    const res = await handler(makeEvent(validBody));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBeDefined();
  });

  test('returns 403 for UserNotConfirmedException', async () => {
    mockInitiateAuth.mockReturnValue({
      promise: () => Promise.reject(makeCognitoError('UserNotConfirmedException', 'User is not confirmed.')),
    });
    const res = await handler(makeEvent(validBody));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/verification/i);
  });

  test('returns 400 when email is missing', async () => {
    const res = await handler(makeEvent({ password: 'Password1!' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/email/i);
  });

  test('returns 400 when password is missing', async () => {
    const res = await handler(makeEvent({ email: 'user@example.com' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/password/i);
  });

  test('returns 400 when both fields are missing', async () => {
    const res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
  });
});

// ─── forgotPassword.js ───────────────────────────────────────────────────────

describe('forgotPassword handler', () => {
  let mockForgotPassword;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.COGNITO_CLIENT_ID = 'test-client-id';

    mockForgotPassword = jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) });

    jest.doMock('aws-sdk', () => ({
      CognitoIdentityServiceProvider: jest.fn(() => ({
        forgotPassword: mockForgotPassword,
      })),
    }));

    handler = require('../../../src/functions/auth/forgotPassword').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns 200 for a registered email', async () => {
    const res = await handler(makeEvent({ email: 'user@example.com' }));
    expect(res.statusCode).toBe(200);
  });

  test('returns 200 even when UserNotFoundException is thrown (no enumeration)', async () => {
    mockForgotPassword.mockReturnValue({
      promise: () => Promise.reject(makeCognitoError('UserNotFoundException', 'User does not exist.')),
    });
    const res = await handler(makeEvent({ email: 'nobody@example.com' }));
    expect(res.statusCode).toBe(200);
  });

  test('returns 200 even when other Cognito errors occur', async () => {
    mockForgotPassword.mockReturnValue({
      promise: () => Promise.reject(makeCognitoError('LimitExceededException', 'Attempt limit exceeded.')),
    });
    const res = await handler(makeEvent({ email: 'user@example.com' }));
    expect(res.statusCode).toBe(200);
  });

  test('returns 400 when email is missing', async () => {
    const res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/email/i);
  });
});

// ─── confirmPassword.js ──────────────────────────────────────────────────────

describe('confirmPassword handler', () => {
  const validBody = { email: 'user@example.com', code: '123456', newPassword: 'NewPass1!' };

  let mockConfirmForgotPassword;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.COGNITO_CLIENT_ID = 'test-client-id';

    mockConfirmForgotPassword = jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) });

    jest.doMock('aws-sdk', () => ({
      CognitoIdentityServiceProvider: jest.fn(() => ({
        confirmForgotPassword: mockConfirmForgotPassword,
      })),
    }));

    handler = require('../../../src/functions/auth/confirmPassword').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns 200 on successful password reset', async () => {
    const res = await handler(makeEvent(validBody));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toMatch(/password reset/i);
  });

  test('returns 400 for CodeMismatchException', async () => {
    mockConfirmForgotPassword.mockReturnValue({
      promise: () => Promise.reject(makeCognitoError('CodeMismatchException', 'Invalid verification code provided.')),
    });
    const res = await handler(makeEvent(validBody));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/invalid verification code/i);
  });

  test('returns 400 for ExpiredCodeException', async () => {
    mockConfirmForgotPassword.mockReturnValue({
      promise: () => Promise.reject(makeCognitoError('ExpiredCodeException', 'Invalid code provided, please request a code again.')),
    });
    const res = await handler(makeEvent(validBody));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBeDefined();
  });

  test('returns 400 when email is missing', async () => {
    const { email: _omit, ...body } = validBody;
    const res = await handler(makeEvent(body));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/email/i);
  });

  test('returns 400 when code is missing', async () => {
    const { code: _omit, ...body } = validBody;
    const res = await handler(makeEvent(body));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/code/i);
  });

  test('returns 400 when newPassword is missing', async () => {
    const { newPassword: _omit, ...body } = validBody;
    const res = await handler(makeEvent(body));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/newPassword/i);
  });
});
