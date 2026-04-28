'use strict';

// Virtual module mocks for Lambda Layer paths
jest.mock('/opt/auth', () => require('../../../src/layer/auth'), { virtual: true });
jest.mock('/opt/errors', () => require('../../../src/layer/errors'), { virtual: true });
jest.mock('/opt/response', () => require('../../../src/layer/response'), { virtual: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCustomerEvent() {
  return {
    requestContext: {
      authorizer: {
        claims: {
          sub: 'user-123',
          'cognito:groups': 'Customer',
        },
      },
    },
    body: null,
    pathParameters: null,
  };
}

function makeUnauthEvent() {
  return { requestContext: {}, body: null, pathParameters: null };
}

// ─── getCart ──────────────────────────────────────────────────────────────────

describe('getCart handler', () => {
  let mockQuery;
  let mockBatchGet;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.PRODUCTS_TABLE = 'test-products';
    process.env.CARTS_TABLE = 'test-carts';

    mockQuery = jest.fn();
    mockBatchGet = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ query: mockQuery, batchGet: mockBatchGet }),
    }), { virtual: true });

    handler = require('../../../src/functions/cart/getCart').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('200 — returns items with lineTotals and correct grandTotal', async () => {
    mockQuery.mockReturnValue({
      promise: () => Promise.resolve({
        Items: [
          { userId: 'user-123', productId: 'prod-1', quantity: 2 },
          { userId: 'user-123', productId: 'prod-2', quantity: 3 },
        ],
      }),
    });
    mockBatchGet.mockReturnValue({
      promise: () => Promise.resolve({
        Responses: {
          'test-products': [
            { productId: 'prod-1', name: 'Widget', price: 10.00 },
            { productId: 'prod-2', name: 'Gadget', price: 5.50 },
          ],
        },
      }),
    });

    const res = await handler(makeCustomerEvent());

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // Items present
    expect(body.items).toHaveLength(2);

    const item1 = body.items.find((i) => i.productId === 'prod-1');
    const item2 = body.items.find((i) => i.productId === 'prod-2');

    expect(item1.productName).toBe('Widget');
    expect(item1.unitPrice).toBe(10.00);
    expect(item1.quantity).toBe(2);
    expect(item1.lineTotal).toBe(20.00);

    expect(item2.productName).toBe('Gadget');
    expect(item2.unitPrice).toBe(5.50);
    expect(item2.quantity).toBe(3);
    expect(item2.lineTotal).toBe(16.50);

    // grandTotal equals sum of lineTotals
    const expectedGrandTotal = item1.lineTotal + item2.lineTotal;
    expect(body.grandTotal).toBe(expectedGrandTotal);
    expect(body.grandTotal).toBe(36.50);
  });

  test('grandTotal equals sum of all lineTotals', async () => {
    mockQuery.mockReturnValue({
      promise: () => Promise.resolve({
        Items: [
          { userId: 'user-123', productId: 'p1', quantity: 1 },
          { userId: 'user-123', productId: 'p2', quantity: 4 },
          { userId: 'user-123', productId: 'p3', quantity: 2 },
        ],
      }),
    });
    mockBatchGet.mockReturnValue({
      promise: () => Promise.resolve({
        Responses: {
          'test-products': [
            { productId: 'p1', name: 'A', price: 7.00 },
            { productId: 'p2', name: 'B', price: 3.25 },
            { productId: 'p3', name: 'C', price: 12.00 },
          ],
        },
      }),
    });

    const res = await handler(makeCustomerEvent());
    const body = JSON.parse(res.body);

    const sumOfLineTotals = body.items.reduce((sum, item) => sum + item.lineTotal, 0);
    expect(body.grandTotal).toBe(sumOfLineTotals);
    // 1*7 + 4*3.25 + 2*12 = 7 + 13 + 24 = 44
    expect(body.grandTotal).toBe(44);
  });

  test('200 — returns empty cart when no items', async () => {
    mockQuery.mockReturnValue({
      promise: () => Promise.resolve({ Items: [] }),
    });

    const res = await handler(makeCustomerEvent());

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toEqual([]);
    expect(body.grandTotal).toBe(0);
    // batchGet should not be called for empty cart
    expect(mockBatchGet).not.toHaveBeenCalled();
  });

  test('403 — no auth context', async () => {
    const res = await handler(makeUnauthEvent());

    expect(res.statusCode).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('query uses userId from JWT claims', async () => {
    mockQuery.mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) });

    await handler(makeCustomerEvent());

    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'test-carts',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': 'user-123' },
      })
    );
  });
});
