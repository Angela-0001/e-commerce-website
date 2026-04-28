'use strict';

// Virtual module mocks for Lambda Layer paths
jest.mock('/opt/auth', () => require('../../../src/layer/auth'), { virtual: true });
jest.mock('/opt/validate', () => require('../../../src/layer/validate'), { virtual: true });
jest.mock('/opt/errors', () => require('../../../src/layer/errors'), { virtual: true });
jest.mock('/opt/response', () => require('../../../src/layer/response'), { virtual: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAdminEvent(body, pathParameters) {
  return {
    requestContext: {
      authorizer: {
        claims: {
          sub: 'admin-user-id',
          'cognito:groups': 'Admin',
        },
      },
    },
    body: body !== undefined ? JSON.stringify(body) : null,
    pathParameters: pathParameters || null,
  };
}

function makeCustomerEvent(body, pathParameters) {
  return {
    requestContext: {
      authorizer: {
        claims: {
          sub: 'customer-user-id',
          'cognito:groups': 'Customer',
        },
      },
    },
    body: body !== undefined ? JSON.stringify(body) : null,
    pathParameters: pathParameters || null,
  };
}

const validProductBody = {
  name: 'Test Product',
  description: 'A test product',
  price: 9.99,
  stockQuantity: 10,
  categoryId: 'cat-123',
  imageKeys: ['images/product1.jpg'],
};

// ─── createProduct ────────────────────────────────────────────────────────────

describe('createProduct handler', () => {
  let mockPut;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.PRODUCTS_TABLE = 'test-products-table';

    mockPut = jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) });

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ put: mockPut }),
    }), { virtual: true });

    handler = require('../../../src/functions/products/createProduct').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns 201 with productId and isActive=true on success', async () => {
    const res = await handler(makeAdminEvent(validProductBody));

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.productId).toBeDefined();
    expect(body.name).toBe('Test Product');
    expect(body.price).toBe(9.99);
    expect(body.stockQuantity).toBe(10);
    expect(body.isActive).toBe(true);
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
    expect(mockPut).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-products-table',
        Item: expect.objectContaining({ isActive: true }),
      })
    );
  });

  test('returns 400 when price is negative', async () => {
    const res = await handler(makeAdminEvent({ ...validProductBody, price: -1 }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/price/i);
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('returns 400 when price is zero', async () => {
    const res = await handler(makeAdminEvent({ ...validProductBody, price: 0 }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/price/i);
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('returns 400 when stockQuantity is non-integer', async () => {
    const res = await handler(makeAdminEvent({ ...validProductBody, stockQuantity: 1.5 }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/stockQuantity/i);
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('returns 400 when stockQuantity is negative', async () => {
    const res = await handler(makeAdminEvent({ ...validProductBody, stockQuantity: -1 }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/stockQuantity/i);
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('returns 400 when name is missing', async () => {
    const { name, ...bodyWithoutName } = validProductBody;
    const res = await handler(makeAdminEvent(bodyWithoutName));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/name/i);
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('returns 400 when description is missing', async () => {
    const { description, ...body } = validProductBody;
    const res = await handler(makeAdminEvent(body));

    expect(res.statusCode).toBe(400);
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('returns 400 when categoryId is missing', async () => {
    const { categoryId, ...body } = validProductBody;
    const res = await handler(makeAdminEvent(body));

    expect(res.statusCode).toBe(400);
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('returns 400 when imageKeys is empty array', async () => {
    const res = await handler(makeAdminEvent({ ...validProductBody, imageKeys: [] }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/imageKeys/i);
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('returns 403 when caller is not Admin', async () => {
    const res = await handler(makeCustomerEvent(validProductBody));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/admin/i);
    expect(mockPut).not.toHaveBeenCalled();
  });
});

// ─── updateProduct ────────────────────────────────────────────────────────────

describe('updateProduct handler', () => {
  let mockGet;
  let mockUpdate;
  let handler;

  const productId = 'prod-abc-123';
  const existingProduct = {
    productId,
    name: 'Old Name',
    description: 'Old desc',
    price: 5.00,
    stockQuantity: 5,
    categoryId: 'cat-1',
    imageKeys: ['img/old.jpg'],
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.resetModules();
    process.env.PRODUCTS_TABLE = 'test-products-table';

    mockGet = jest.fn();
    mockUpdate = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ get: mockGet, update: mockUpdate }),
    }), { virtual: true });

    handler = require('../../../src/functions/products/updateProduct').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns 200 with updated product on success', async () => {
    const updatedProduct = { ...existingProduct, name: 'New Name', updatedAt: '2024-06-01T00:00:00.000Z' };
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: existingProduct }) });
    mockUpdate.mockReturnValue({ promise: () => Promise.resolve({ Attributes: updatedProduct }) });

    const res = await handler(makeAdminEvent({ name: 'New Name' }, { productId }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.name).toBe('New Name');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-products-table',
        Key: { productId },
        ReturnValues: 'ALL_NEW',
      })
    );
  });

  test('returns 404 when product does not exist', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: undefined }) });

    const res = await handler(makeAdminEvent({ name: 'New Name' }, { productId }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('returns 404 when product is inactive', async () => {
    mockGet.mockReturnValue({
      promise: () => Promise.resolve({ Item: { ...existingProduct, isActive: false } }),
    });

    const res = await handler(makeAdminEvent({ name: 'New Name' }, { productId }));

    expect(res.statusCode).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('returns 403 when caller is not Admin', async () => {
    const res = await handler(makeCustomerEvent({ name: 'New Name' }, { productId }));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/admin/i);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('returns 400 when updated price is invalid', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: existingProduct }) });

    const res = await handler(makeAdminEvent({ price: -5 }, { productId }));

    expect(res.statusCode).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('returns 400 when updated stockQuantity is non-integer', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: existingProduct }) });

    const res = await handler(makeAdminEvent({ stockQuantity: 2.7 }, { productId }));

    expect(res.statusCode).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ─── deleteProduct ────────────────────────────────────────────────────────────

describe('deleteProduct handler', () => {
  let mockGet;
  let mockUpdate;
  let handler;

  const productId = 'prod-del-123';
  const activeProduct = {
    productId,
    name: 'Product to Delete',
    isActive: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.resetModules();
    process.env.PRODUCTS_TABLE = 'test-products-table';

    mockGet = jest.fn();
    mockUpdate = jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) });

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ get: mockGet, update: mockUpdate }),
    }), { virtual: true });

    handler = require('../../../src/functions/products/deleteProduct').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns 204 on successful soft-delete', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: activeProduct }) });

    const res = await handler(makeAdminEvent(null, { productId }));

    expect(res.statusCode).toBe(204);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-products-table',
        Key: { productId },
        UpdateExpression: expect.stringContaining('isActive'),
        ExpressionAttributeValues: expect.objectContaining({ ':inactive': false }),
      })
    );
  });

  test('returns 404 when product does not exist', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: undefined }) });

    const res = await handler(makeAdminEvent(null, { productId }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('returns 404 when product is already inactive', async () => {
    mockGet.mockReturnValue({
      promise: () => Promise.resolve({ Item: { ...activeProduct, isActive: false } }),
    });

    const res = await handler(makeAdminEvent(null, { productId }));

    expect(res.statusCode).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('returns 403 when caller is not Admin', async () => {
    const res = await handler(makeCustomerEvent(null, { productId }));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/admin/i);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
