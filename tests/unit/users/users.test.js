'use strict';

// Virtual module mocks for the Lambda Layer paths
jest.mock('/opt/auth', () => require('../../../src/layer/auth'), { virtual: true });
jest.mock('/opt/validate', () => require('../../../src/layer/validate'), { virtual: true });
jest.mock('/opt/errors', () => require('../../../src/layer/errors'), { virtual: true });
jest.mock('/opt/response', () => require('../../../src/layer/response'), { virtual: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAuthEvent(userId, body) {
  return {
    requestContext: {
      authorizer: {
        claims: {
          sub: userId,
          'cognito:groups': 'Customer',
        },
      },
    },
    body: body !== undefined ? JSON.stringify(body) : null,
  };
}

function makeNoAuthEvent(body) {
  return {
    requestContext: {},
    body: body !== undefined ? JSON.stringify(body) : null,
  };
}

// ─── getProfile.js ────────────────────────────────────────────────────────────

describe('getProfile handler', () => {
  const userId = 'user-abc-123';
  const profileItem = {
    userId,
    name: 'Alice',
    email: 'alice@example.com',
    phoneNumber: '+12125551234',
    address: { street: '1 Main St', city: 'NYC', state: 'NY', postalCode: '10001', country: 'US' },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  let mockGet;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.USERS_TABLE = 'test-users-table';

    mockGet = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ get: mockGet }),
    }), { virtual: true });

    handler = require('../../../src/functions/users/getProfile').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns 200 with profile data when user exists', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: profileItem }) });

    const res = await handler(makeAuthEvent(userId));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.userId).toBe(userId);
    expect(body.name).toBe('Alice');
    expect(body.email).toBe('alice@example.com');
    expect(mockGet).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-users-table',
        Key: { userId },
      })
    );
  });

  test('returns 404 when user profile not found', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: undefined }) });

    const res = await handler(makeAuthEvent(userId));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found/i);
  });

  test('returns 403 when auth context is missing', async () => {
    const res = await handler(makeNoAuthEvent());

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/authorization/i);
  });

  test('uses userId from JWT claims (not from path param)', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: profileItem }) });

    // Event has JWT userId = 'user-abc-123'; no path param involved
    const event = makeAuthEvent('jwt-user-id');
    await handler(event);

    expect(mockGet).toHaveBeenCalledWith(
      expect.objectContaining({ Key: { userId: 'jwt-user-id' } })
    );
  });
});

// ─── updateProfile.js ────────────────────────────────────────────────────────

describe('updateProfile handler', () => {
  const userId = 'user-abc-123';
  const updatedItem = {
    userId,
    name: 'Alice Updated',
    email: 'alice@example.com',
    phoneNumber: '+12125559999',
    address: { street: '2 New St', city: 'NYC', state: 'NY', postalCode: '10002', country: 'US' },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
  };

  let mockUpdate;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.USERS_TABLE = 'test-users-table';

    mockUpdate = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ update: mockUpdate }),
    }), { virtual: true });

    handler = require('../../../src/functions/users/updateProfile').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns 200 with updated profile data', async () => {
    mockUpdate.mockReturnValue({ promise: () => Promise.resolve({ Attributes: updatedItem }) });

    const res = await handler(makeAuthEvent(userId, { name: 'Alice Updated', phoneNumber: '+12125559999' }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('Alice Updated');
    expect(body.phoneNumber).toBe('+12125559999');
  });

  test('returns 400 for invalid E.164 phone number', async () => {
    const res = await handler(makeAuthEvent(userId, { phoneNumber: '555-1234' }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/E\.164/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('returns 400 for phone number without country code', async () => {
    const res = await handler(makeAuthEvent(userId, { phoneNumber: '12125551234' }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/E\.164/i);
  });

  test('returns 403 when auth context is missing', async () => {
    const res = await handler(makeNoAuthEvent({ name: 'Bob' }));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/authorization/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('uses userId from JWT claims for DynamoDB key', async () => {
    mockUpdate.mockReturnValue({ promise: () => Promise.resolve({ Attributes: updatedItem }) });

    await handler(makeAuthEvent('jwt-user-id', { name: 'New Name' }));

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ Key: { userId: 'jwt-user-id' } })
    );
  });

  test('accepts valid E.164 phone number', async () => {
    mockUpdate.mockReturnValue({ promise: () => Promise.resolve({ Attributes: updatedItem }) });

    const res = await handler(makeAuthEvent(userId, { phoneNumber: '+442071234567' }));

    expect(res.statusCode).toBe(200);
  });

  test('updates address field when provided', async () => {
    const address = { street: '5 Park Ave', city: 'NYC', state: 'NY', postalCode: '10003', country: 'US' };
    mockUpdate.mockReturnValue({ promise: () => Promise.resolve({ Attributes: { ...updatedItem, address } }) });

    const res = await handler(makeAuthEvent(userId, { address }));

    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { userId },
        UpdateExpression: expect.stringContaining('address'),
      })
    );
  });
});
