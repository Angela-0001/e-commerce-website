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

function makeNoAuthEvent(pathParameters) {
  return {
    requestContext: {},
    body: null,
    pathParameters: pathParameters || null,
  };
}

// ─── createCategory ───────────────────────────────────────────────────────────

describe('createCategory handler', () => {
  let mockPut;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.CATEGORIES_TABLE = 'test-categories-table';

    mockPut = jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) });

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ put: mockPut }),
    }), { virtual: true });

    handler = require('../../../src/functions/products/createCategory').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns 201 with categoryId and isActive=true on success', async () => {
    const res = await handler(makeAdminEvent({ name: 'Electronics' }));

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.categoryId).toBeDefined();
    expect(body.name).toBe('Electronics');
    expect(body.isActive).toBe(true);
    expect(body.createdAt).toBeDefined();
    expect(mockPut).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-categories-table',
        Item: expect.objectContaining({ name: 'Electronics', isActive: true }),
      })
    );
  });

  test('returns 400 when name field is missing', async () => {
    const res = await handler(makeAdminEvent({}));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/name/i);
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('returns 400 when body is empty', async () => {
    const event = makeAdminEvent({});
    event.body = null;
    const res = await handler(event);

    expect(res.statusCode).toBe(400);
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('returns 403 when caller is not Admin', async () => {
    const res = await handler(makeCustomerEvent({ name: 'Electronics' }));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/admin/i);
    expect(mockPut).not.toHaveBeenCalled();
  });

  test('returns 403 when no auth context', async () => {
    const event = makeNoAuthEvent();
    event.body = JSON.stringify({ name: 'Electronics' });
    const res = await handler(event);

    expect(res.statusCode).toBe(403);
    expect(mockPut).not.toHaveBeenCalled();
  });
});

// ─── listCategories ───────────────────────────────────────────────────────────

describe('listCategories handler', () => {
  let mockScan;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.CATEGORIES_TABLE = 'test-categories-table';

    mockScan = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ scan: mockScan }),
    }), { virtual: true });

    handler = require('../../../src/functions/products/listCategories').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns only isActive=true categories', async () => {
    const activeCategory = { categoryId: 'cat-1', name: 'Electronics', isActive: true, createdAt: '2024-01-01T00:00:00.000Z' };
    mockScan.mockReturnValue({
      promise: () => Promise.resolve({ Items: [activeCategory] }),
    });

    const res = await handler({});

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);
    expect(body[0].categoryId).toBe('cat-1');
    expect(body[0].isActive).toBe(true);
  });

  test('filters out inactive categories via DynamoDB FilterExpression', async () => {
    mockScan.mockReturnValue({
      promise: () => Promise.resolve({ Items: [] }),
    });

    await handler({});

    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({
        FilterExpression: expect.stringContaining('isActive'),
        ExpressionAttributeValues: expect.objectContaining({ ':active': true }),
      })
    );
  });

  test('returns empty array when no active categories exist', async () => {
    mockScan.mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) });

    const res = await handler({});

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  test('returns empty array when Items is undefined', async () => {
    mockScan.mockReturnValue({ promise: () => Promise.resolve({}) });

    const res = await handler({});

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });
});

// ─── deleteCategory ───────────────────────────────────────────────────────────

describe('deleteCategory handler', () => {
  let mockGet;
  let mockQuery;
  let mockUpdate;
  let handler;

  const categoryId = 'cat-abc-123';
  const activeCategory = { categoryId, name: 'Electronics', isActive: true, createdAt: '2024-01-01T00:00:00.000Z' };

  beforeEach(() => {
    jest.resetModules();
    process.env.CATEGORIES_TABLE = 'test-categories-table';
    process.env.PRODUCTS_TABLE = 'test-products-table';

    mockGet = jest.fn();
    mockQuery = jest.fn();
    mockUpdate = jest.fn().mockReturnValue({ promise: () => Promise.resolve({}) });

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ get: mockGet, query: mockQuery, update: mockUpdate }),
    }), { virtual: true });

    handler = require('../../../src/functions/products/deleteCategory').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns 204 on successful soft-delete', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: activeCategory }) });
    mockQuery.mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) });

    const res = await handler(makeAdminEvent(null, { categoryId }));

    expect(res.statusCode).toBe(204);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-categories-table',
        Key: { categoryId },
        UpdateExpression: expect.stringContaining('isActive'),
        ExpressionAttributeValues: expect.objectContaining({ ':inactive': false }),
      })
    );
  });

  test('returns 409 when active products exist in the category', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: activeCategory }) });
    mockQuery.mockReturnValue({
      promise: () => Promise.resolve({ Items: [{ productId: 'prod-1', isActive: true }] }),
    });

    const res = await handler(makeAdminEvent(null, { categoryId }));

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/active products/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('returns 403 when caller is not Admin', async () => {
    const res = await handler(makeCustomerEvent(null, { categoryId }));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/admin/i);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('returns 404 when category does not exist', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: undefined }) });

    const res = await handler(makeAdminEvent(null, { categoryId }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('returns 404 when category is already inactive', async () => {
    mockGet.mockReturnValue({
      promise: () => Promise.resolve({ Item: { ...activeCategory, isActive: false } }),
    });

    const res = await handler(makeAdminEvent(null, { categoryId }));

    expect(res.statusCode).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('queries CategoryIndex on ProductsTable to check active products', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: activeCategory }) });
    mockQuery.mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) });

    await handler(makeAdminEvent(null, { categoryId }));

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-products-table',
        IndexName: 'CategoryIndex',
        KeyConditionExpression: expect.stringContaining('categoryId'),
        ExpressionAttributeValues: expect.objectContaining({ ':cid': categoryId }),
      })
    );
  });
});
