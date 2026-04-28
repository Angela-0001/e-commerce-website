'use strict';

// Virtual module mocks for Lambda Layer paths
jest.mock('/opt/validate', () => require('../../../src/layer/validate'), { virtual: true });
jest.mock('/opt/errors', () => require('../../../src/layer/errors'), { virtual: true });
jest.mock('/opt/response', () => require('../../../src/layer/response'), { virtual: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(queryStringParameters = {}, pathParameters = null) {
  return { queryStringParameters, pathParameters };
}

const activeProduct = (overrides = {}) => ({
  productId: 'prod-1',
  name: 'Widget',
  description: 'A widget',
  price: 9.99,
  stockQuantity: 10,
  categoryId: 'cat-1',
  imageKeys: ['img/widget.jpg'],
  isActive: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

// ─── listProducts ─────────────────────────────────────────────────────────────

describe('listProducts handler', () => {
  let mockScan;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.PRODUCTS_TABLE = 'test-products-table';

    mockScan = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ scan: mockScan }),
    }), { virtual: true });

    handler = require('../../../src/functions/products/listProducts').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns only active products', async () => {
    const items = [activeProduct(), activeProduct({ productId: 'prod-2', name: 'Gadget' })];
    mockScan.mockReturnValue({ promise: () => Promise.resolve({ Items: items }) });

    const res = await handler(makeEvent());

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(2);
    body.items.forEach((item) => expect(item.isActive).toBe(true));
    // Verify FilterExpression includes isActive check
    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({
        FilterExpression: expect.stringContaining('isActive = :active'),
        ExpressionAttributeValues: expect.objectContaining({ ':active': true }),
      })
    );
  });

  test('returns nextToken when LastEvaluatedKey is present', async () => {
    const lastKey = { productId: 'prod-last' };
    mockScan.mockReturnValue({
      promise: () => Promise.resolve({ Items: [activeProduct()], LastEvaluatedKey: lastKey }),
    });

    const res = await handler(makeEvent());

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.nextToken).toBeDefined();
    // Decode and verify it matches the LastEvaluatedKey
    const decoded = JSON.parse(Buffer.from(body.nextToken, 'base64').toString('utf8'));
    expect(decoded).toEqual(lastKey);
  });

  test('omits nextToken when no more pages', async () => {
    mockScan.mockReturnValue({ promise: () => Promise.resolve({ Items: [activeProduct()] }) });

    const res = await handler(makeEvent());

    const body = JSON.parse(res.body);
    expect(body.nextToken).toBeUndefined();
  });

  test('passes ExclusiveStartKey when nextToken is provided', async () => {
    const lastKey = { productId: 'prod-cursor' };
    const token = Buffer.from(JSON.stringify(lastKey)).toString('base64');
    mockScan.mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) });

    await handler(makeEvent({ nextToken: token }));

    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({ ExclusiveStartKey: lastKey })
    );
  });

  test('applies search filter to FilterExpression', async () => {
    mockScan.mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) });

    await handler(makeEvent({ search: 'widget' }));

    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({
        FilterExpression: expect.stringContaining('contains(#name, :search)'),
        ExpressionAttributeValues: expect.objectContaining({ ':search': 'widget' }),
        ExpressionAttributeNames: expect.objectContaining({ '#name': 'name' }),
      })
    );
  });

  test('applies categoryId filter to FilterExpression', async () => {
    mockScan.mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) });

    await handler(makeEvent({ categoryId: 'cat-42' }));

    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({
        FilterExpression: expect.stringContaining('categoryId = :categoryId'),
        ExpressionAttributeValues: expect.objectContaining({ ':categoryId': 'cat-42' }),
      })
    );
  });

  test('applies minPrice and maxPrice filters', async () => {
    mockScan.mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) });

    await handler(makeEvent({ minPrice: '5', maxPrice: '50' }));

    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({
        FilterExpression: expect.stringContaining('price >= :minPrice'),
        ExpressionAttributeValues: expect.objectContaining({
          ':minPrice': 5,
          ':maxPrice': 50,
        }),
      })
    );
  });

  test('returns 400 for negative minPrice', async () => {
    const res = await handler(makeEvent({ minPrice: '-1' }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/minPrice/i);
    expect(mockScan).not.toHaveBeenCalled();
  });

  test('returns 400 for negative maxPrice', async () => {
    const res = await handler(makeEvent({ maxPrice: '-5' }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/maxPrice/i);
    expect(mockScan).not.toHaveBeenCalled();
  });

  test('returns 400 when minPrice exceeds maxPrice', async () => {
    const res = await handler(makeEvent({ minPrice: '100', maxPrice: '10' }));

    expect(res.statusCode).toBe(400);
    expect(mockScan).not.toHaveBeenCalled();
  });

  test('caps pageSize at 100', async () => {
    mockScan.mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) });

    await handler(makeEvent({ pageSize: '500' }));

    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({ Limit: 100 })
    );
  });

  test('returns 400 for invalid pageSize', async () => {
    const res = await handler(makeEvent({ pageSize: '0' }));

    expect(res.statusCode).toBe(400);
    expect(mockScan).not.toHaveBeenCalled();
  });

  test('defaults pageSize to 20', async () => {
    mockScan.mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) });

    await handler(makeEvent());

    expect(mockScan).toHaveBeenCalledWith(
      expect.objectContaining({ Limit: 20 })
    );
  });
});

// ─── getProduct ───────────────────────────────────────────────────────────────

describe('getProduct handler', () => {
  let mockGet;
  let handler;

  const productId = 'prod-detail-1';
  const product = activeProduct({ productId });

  beforeEach(() => {
    jest.resetModules();
    process.env.PRODUCTS_TABLE = 'test-products-table';

    mockGet = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ get: mockGet }),
    }), { virtual: true });

    handler = require('../../../src/functions/products/getProduct').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns 200 with full product data for active product', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: product }) });

    const res = await handler(makeEvent({}, { productId }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.productId).toBe(productId);
    expect(body.name).toBe(product.name);
    expect(body.description).toBe(product.description);
    expect(body.price).toBe(product.price);
    expect(body.stockQuantity).toBe(product.stockQuantity);
    expect(body.categoryId).toBe(product.categoryId);
    expect(body.imageKeys).toEqual(product.imageKeys);
    expect(body.isActive).toBe(true);
    expect(mockGet).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-products-table',
        Key: { productId },
      })
    );
  });

  test('returns 404 when product does not exist', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: undefined }) });

    const res = await handler(makeEvent({}, { productId }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found/i);
  });

  test('returns 404 when product is inactive', async () => {
    mockGet.mockReturnValue({
      promise: () => Promise.resolve({ Item: { ...product, isActive: false } }),
    });

    const res = await handler(makeEvent({}, { productId }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found/i);
  });
});
