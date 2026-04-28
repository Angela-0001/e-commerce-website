'use strict';

// Virtual module mocks for Lambda Layer paths
jest.mock('/opt/auth', () => require('../../../src/layer/auth'), { virtual: true });
jest.mock('/opt/errors', () => require('../../../src/layer/errors'), { virtual: true });
jest.mock('/opt/response', () => require('../../../src/layer/response'), { virtual: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCustomerEvent(body, pathParameters) {
  return {
    requestContext: {
      authorizer: {
        claims: {
          sub: 'user-123',
          'cognito:groups': 'Customer',
        },
      },
    },
    body: body !== undefined ? JSON.stringify(body) : null,
    pathParameters: pathParameters || null,
  };
}

function makeUnauthEvent(body, pathParameters) {
  return {
    requestContext: {},
    body: body !== undefined ? JSON.stringify(body) : null,
    pathParameters: pathParameters || null,
  };
}

const activeProduct = {
  productId: 'prod-1',
  name: 'Widget',
  price: 9.99,
  stockQuantity: 10,
  isActive: true,
};

// ─── addItem ──────────────────────────────────────────────────────────────────

describe('addItem handler', () => {
  let mockGet;
  let mockUpdate;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.PRODUCTS_TABLE = 'test-products';
    process.env.CARTS_TABLE = 'test-carts';

    mockGet = jest.fn();
    mockUpdate = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ get: mockGet, update: mockUpdate }),
    }), { virtual: true });

    handler = require('../../../src/functions/cart/addItem').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('200 success — adds item to cart', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: activeProduct }) });
    const cartItem = { userId: 'user-123', productId: 'prod-1', quantity: 2, addedAt: '2024-01-01T00:00:00.000Z' };
    mockUpdate.mockReturnValue({ promise: () => Promise.resolve({ Attributes: cartItem }) });

    const res = await handler(makeCustomerEvent({ productId: 'prod-1', quantity: 2 }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.userId).toBe('user-123');
    expect(body.productId).toBe('prod-1');
    expect(body.quantity).toBe(2);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-carts',
        Key: { userId: 'user-123', productId: 'prod-1' },
      })
    );
  });

  test('404 — product not found', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: undefined }) });

    const res = await handler(makeCustomerEvent({ productId: 'no-such-prod', quantity: 1 }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('404 — inactive product', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: { ...activeProduct, isActive: false } }) });

    const res = await handler(makeCustomerEvent({ productId: 'prod-1', quantity: 1 }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('409 — quantity exceeds stock', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: activeProduct }) }); // stockQuantity=10

    const res = await handler(makeCustomerEvent({ productId: 'prod-1', quantity: 11 }));

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/stock/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('400 — missing productId', async () => {
    const res = await handler(makeCustomerEvent({ quantity: 1 }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/productId/i);
  });

  test('400 — missing quantity', async () => {
    const res = await handler(makeCustomerEvent({ productId: 'prod-1' }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/quantity/i);
  });

  test('400 — quantity less than 1', async () => {
    const res = await handler(makeCustomerEvent({ productId: 'prod-1', quantity: 0 }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/quantity/i);
  });

  test('403 — no auth context', async () => {
    const res = await handler(makeUnauthEvent({ productId: 'prod-1', quantity: 1 }));

    expect(res.statusCode).toBe(403);
  });
});

// ─── updateItem ───────────────────────────────────────────────────────────────

describe('updateItem handler', () => {
  let mockGet;
  let mockUpdate;
  let mockDelete;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.PRODUCTS_TABLE = 'test-products';
    process.env.CARTS_TABLE = 'test-carts';

    mockGet = jest.fn();
    mockUpdate = jest.fn();
    mockDelete = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ get: mockGet, update: mockUpdate, delete: mockDelete }),
    }), { virtual: true });

    handler = require('../../../src/functions/cart/updateItem').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('200 success — updates quantity', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: activeProduct }) });
    const updatedItem = { userId: 'user-123', productId: 'prod-1', quantity: 5, addedAt: '2024-01-01T00:00:00.000Z' };
    mockUpdate.mockReturnValue({ promise: () => Promise.resolve({ Attributes: updatedItem }) });

    const res = await handler(makeCustomerEvent({ quantity: 5 }, { productId: 'prod-1' }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.quantity).toBe(5);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-carts',
        Key: { userId: 'user-123', productId: 'prod-1' },
        ExpressionAttributeValues: expect.objectContaining({ ':qty': 5 }),
      })
    );
  });

  test('200 — removes item when quantity is 0', async () => {
    mockDelete.mockReturnValue({ promise: () => Promise.resolve({}) });

    const res = await handler(makeCustomerEvent({ quantity: 0 }, { productId: 'prod-1' }));

    expect(res.statusCode).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-carts',
        Key: { userId: 'user-123', productId: 'prod-1' },
      })
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('200 — removes item when quantity is negative', async () => {
    mockDelete.mockReturnValue({ promise: () => Promise.resolve({}) });

    const res = await handler(makeCustomerEvent({ quantity: -3 }, { productId: 'prod-1' }));

    expect(res.statusCode).toBe(200);
    expect(mockDelete).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('404 — product not found', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: undefined }) });

    const res = await handler(makeCustomerEvent({ quantity: 2 }, { productId: 'no-such-prod' }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('409 — quantity exceeds stock', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: activeProduct }) }); // stockQuantity=10

    const res = await handler(makeCustomerEvent({ quantity: 99 }, { productId: 'prod-1' }));

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/stock/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('403 — no auth context', async () => {
    const res = await handler(makeUnauthEvent({ quantity: 1 }, { productId: 'prod-1' }));

    expect(res.statusCode).toBe(403);
  });
});

// ─── removeItem ───────────────────────────────────────────────────────────────

describe('removeItem handler', () => {
  let mockDelete;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.CARTS_TABLE = 'test-carts';

    mockDelete = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ delete: mockDelete }),
    }), { virtual: true });

    handler = require('../../../src/functions/cart/removeItem').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('204 success — deletes cart item', async () => {
    mockDelete.mockReturnValue({ promise: () => Promise.resolve({}) });

    const res = await handler(makeCustomerEvent(null, { productId: 'prod-1' }));

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect(mockDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-carts',
        Key: { userId: 'user-123', productId: 'prod-1' },
      })
    );
  });

  test('403 — no auth context', async () => {
    const res = await handler(makeUnauthEvent(null, { productId: 'prod-1' }));

    expect(res.statusCode).toBe(403);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
