'use strict';

// Virtual module mocks for the Lambda Layer paths
jest.mock('/opt/validate', () => require('../../../src/layer/validate'), { virtual: true });
jest.mock('/opt/errors', () => require('../../../src/layer/errors'), { virtual: true });
jest.mock('/opt/response', () => require('../../../src/layer/response'), { virtual: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCognitoError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ─── register.js ─────────────────────────────────────────────────────────────

describe('register handler', () => {
  const validBody = {
    email: 'test@example.com',
    password: 'Password1!',
    name: 'Test User',
    phoneNumber: '+12125551234',
  };

  function makeEvent(body) {
    return { body: JSON.stringify(body) };
  }

  let mockSignUp;
  let mockAdminAddUserToGroup;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.COGNITO_CLIENT_ID = 'test-client-id';
    process.env.COGNITO_USER_POOL_ID = 'test-pool-id';

    mockSignUp = jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) });
    mockAdminAddUserToGroup = jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) });

    jest.doMock('aws-sdk', () => ({
      CognitoIdentityServiceProvider: jest.fn(() => ({
        signUp: mockSignUp,
        adminAddUserToGroup: mockAdminAddUserToGroup,
      })),
    }));

    handler = require('../../../src/functions/auth/register').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns 201 on successful registration', async () => {
    const res = await handler(makeEvent(validBody));
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).message).toMatch(/registration successful/i);
    expect(mockSignUp).toHaveBeenCalledTimes(1);
    expect(mockAdminAddUserToGroup).toHaveBeenCalledTimes(1);
  });

  test('returns 409 for UsernameExistsException', async () => {
    mockSignUp.mockReturnValue({
      promise: () => Promise.reject(makeCognitoError('UsernameExistsException', 'User already exists')),
    });
    const res = await handler(makeEvent(validBody));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/user already exists/i);
  });

  test('returns 400 for InvalidPasswordException', async () => {
    mockSignUp.mockReturnValue({
      promise: () => Promise.reject(makeCognitoError('InvalidPasswordException', 'Password does not meet policy')),
    });
    const res = await handler(makeEvent(validBody));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/password/i);
  });

  test('returns 400 when email is missing', async () => {
    const { email: _omit, ...body } = validBody;
    const res = await handler(makeEvent(body));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/email/i);
  });

  test('returns 400 when password is missing', async () => {
    const { password: _omit, ...body } = validBody;
    const res = await handler(makeEvent(body));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/password/i);
  });

  test('returns 400 when name is missing', async () => {
    const { name: _omit, ...body } = validBody;
    const res = await handler(makeEvent(body));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/name/i);
  });

  test('returns 400 when phoneNumber is missing', async () => {
    const { phoneNumber: _omit, ...body } = validBody;
    const res = await handler(makeEvent(body));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/phoneNumber/i);
  });

  test('calls adminAddUserToGroup with Customer group on success', async () => {
    await handler(makeEvent(validBody));
    expect(mockAdminAddUserToGroup).toHaveBeenCalledWith(
      expect.objectContaining({ GroupName: 'Customer', Username: validBody.email })
    );
  });
});

// ─── verify.js ───────────────────────────────────────────────────────────────

describe('verify handler', () => {
  const validBody = { email: 'test@example.com', code: '123456' };

  function makeEvent(body) {
    return { body: JSON.stringify(body) };
  }

  let mockConfirmSignUp;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.COGNITO_CLIENT_ID = 'test-client-id';

    mockConfirmSignUp = jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) });

    jest.doMock('aws-sdk', () => ({
      CognitoIdentityServiceProvider: jest.fn(() => ({
        confirmSignUp: mockConfirmSignUp,
      })),
    }));

    handler = require('../../../src/functions/auth/verify').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns 200 on successful verification', async () => {
    const res = await handler(makeEvent(validBody));
    expect(res.statusCode).toBe(200);
  });

  test('returns 400 for CodeMismatchException', async () => {
    mockConfirmSignUp.mockReturnValue({
      promise: () => Promise.reject(makeCognitoError('CodeMismatchException', 'Invalid verification code')),
    });
    const res = await handler(makeEvent(validBody));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/invalid verification code/i);
  });

  test('returns 400 for ExpiredCodeException', async () => {
    mockConfirmSignUp.mockReturnValue({
      promise: () => Promise.reject(makeCognitoError('ExpiredCodeException', 'Code has expired')),
    });
    const res = await handler(makeEvent(validBody));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/code has expired/i);
  });

  test('returns 400 when email is missing', async () => {
    const res = await handler(makeEvent({ code: '123456' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/email/i);
  });

  test('returns 400 when code is missing', async () => {
    const res = await handler(makeEvent({ email: 'test@example.com' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/code/i);
  });
});

// ─── resendVerification.js ───────────────────────────────────────────────────

describe('resendVerification handler', () => {
  function makeEvent(body) {
    return { body: JSON.stringify(body) };
  }

  let mockResendConfirmationCode;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.COGNITO_CLIENT_ID = 'test-client-id';

    mockResendConfirmationCode = jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) });

    jest.doMock('aws-sdk', () => ({
      CognitoIdentityServiceProvider: jest.fn(() => ({
        resendConfirmationCode: mockResendConfirmationCode,
      })),
    }));

    handler = require('../../../src/functions/auth/resendVerification').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns 200 on success', async () => {
    const res = await handler(makeEvent({ email: 'test@example.com' }));
    expect(res.statusCode).toBe(200);
  });

  test('returns 400 when email is missing', async () => {
    const res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/email/i);
  });
});

// ─── postConfirmation.js ─────────────────────────────────────────────────────

describe('postConfirmation handler', () => {
  const cognitoEvent = {
    userName: 'user-123',
    request: {
      userAttributes: {
        sub: 'user-sub-456',
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone_number: '+12125559999',
      },
    },
  };

  let mockPut;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.USERS_TABLE = 'test-users-table';

    mockPut = jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) });

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ put: mockPut }),
    }), { virtual: true });

    handler = require('../../../src/functions/auth/postConfirmation').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('writes user profile to DynamoDB and returns event', async () => {
    const result = await handler(cognitoEvent);
    expect(mockPut).toHaveBeenCalledTimes(1);
    const callArg = mockPut.mock.calls[0][0];
    expect(callArg.TableName).toBe('test-users-table');
    expect(callArg.Item.userId).toBe('user-sub-456');
    expect(callArg.Item.name).toBe('Jane Doe');
    expect(callArg.Item.email).toBe('jane@example.com');
    expect(callArg.Item.phoneNumber).toBe('+12125559999');
    expect(callArg.Item.address).toEqual({});
    expect(callArg.Item.createdAt).toBeDefined();
    expect(callArg.Item.updatedAt).toBeDefined();
    expect(result).toBe(cognitoEvent);
  });

  test('uses event.userName as fallback when sub is missing', async () => {
    const event = {
      userName: 'fallback-user',
      request: { userAttributes: { name: 'No Sub', email: 'nosub@example.com' } },
    };
    await handler(event);
    const callArg = mockPut.mock.calls[0][0];
    expect(callArg.Item.userId).toBe('fallback-user');
  });
});
