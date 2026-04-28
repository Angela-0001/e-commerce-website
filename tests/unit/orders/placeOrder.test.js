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
  };
}

function makeUnauthEvent() {
  return { requestContext: {}, body: null };
}

const cartItems = [
  { userId: 'user-123', productId: 'prod-1', quantity: 2 },
  { userId: 'user-123', productId: 'prod-2', quantity: 1 },
];

const products = {
  'prod-1': { productId: 'prod-1', name: 'Widget', price: 10.0, stockQuantity: 5 },
  'prod-2': { productId: 'prod-2', name: 'Gadget', price: 20.0, stockQuantity: 3 },
};

const userProfile = {
  userId: 'user-123',
  name: 'Alice',
  address: { street: '1 Main St', city: 'Springfield', state: 'IL', postalCode: '62701', country: 'US' },
};

// ─── placeOrder ───────────────────────────────────────────────────────────────

describe('placeOrder handler', () => {
  let mockQuery;
  let mockBatchGet;
  let mockGet;
  let mockTransactWrite;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.USERS_TABLE = 'test-users';
    process.env.PRODUCTS_TABLE = 'test-products';
    process.env.CARTS_TABLE = 'test-carts';
    process.env.ORDERS_TABLE = 'test-orders';
    process.env.ORDER_ITEMS_TABLE = 'test-order-items';

    mockQuery = jest.fn();
    mockBatchGet = jest.fn();
    mockGet = jest.fn();
    mockTransactWrite = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({
        query: mockQuery,
        batchGet: mockBatchGet,
        get: mockGet,
        transactWrite: mockTransactWrite,
      }),
    }), { virtual: true });

    // Mock uuid to return a predictable value
    jest.doMock('uuid', () => ({ v4: () => 'order-uuid-1234' }));

    handler = require('../../../src/functions/orders/placeOrder').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('201 success — creates order with correct orderId and status=Pending', async () => {
    mockQuery.mockReturnValue({ promise: () => Promise.resolve({ Items: cartItems }) });
    mockBatchGet.mockReturnValue({
      promise: () => Promise.resolve({
        Responses: { 'test-products': Object.values(products) },
      }),
    });
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: userProfile }) });
    mockTransactWrite.mockReturnValue({ promise: () => Promise.resolve({}) });

    const res = await handler(makeCustomerEvent());

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.orderId).toBe('order-uuid-1234');
    expect(body.status).toBe('Pending');
    expect(body.itemCount).toBe(2);
    // totalAmount = 2*10 + 1*20 = 40
    expect(body.totalAmount).toBe(40);
    expect(body.createdAt).toBeDefined();
  });

  test('201 — transactWrite called with Put/Update/Delete items', async () => {
    mockQuery.mockReturnValue({ promise: () => Promise.resolve({ Items: [cartItems[0]] }) });
    mockBatchGet.mockReturnValue({
      promise: () => Promise.resolve({
        Responses: { 'test-products': [products['prod-1']] },
      }),
    });
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: userProfile }) });
    mockTransactWrite.mockReturnValue({ promise: () => Promise.resolve({}) });

    await handler(makeCustomerEvent());

    expect(mockTransactWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        TransactItems: expect.arrayContaining([
          expect.objectContaining({ Put: expect.objectContaining({ TableName: 'test-orders' }) }),
          expect.objectContaining({ Put: expect.objectContaining({ TableName: 'test-order-items' }) }),
          expect.objectContaining({ Update: expect.objectContaining({ TableName: 'test-products' }) }),
          expect.objectContaining({ Delete: expect.objectContaining({ TableName: 'test-carts' }) }),
        ]),
      })
    );
  });

  test('400 — empty cart returns 400', async () => {
    mockQuery.mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) });

    const res = await handler(makeCustomerEvent());

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/empty/i);
    expect(mockTransactWrite).not.toHaveBeenCalled();
  });

  test('409 — pre-transaction stock check fails for over-stock item', async () => {
    const overStockCart = [{ userId: 'user-123', productId: 'prod-1', quantity: 99 }];
    mockQuery.mockReturnValue({ promise: () => Promise.resolve({ Items: overStockCart }) });
    mockBatchGet.mockReturnValue({
      promise: () => Promise.resolve({
        Responses: { 'test-products': [products['prod-1']] }, // stockQuantity=5
      }),
    });

    const res = await handler(makeCustomerEvent());

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/prod-1/);
    expect(mockTransactWrite).not.toHaveBeenCalled();
  });

  test('409 — TransactionCanceledException with ConditionalCheckFailed returns 409', async () => {
    mockQuery.mockReturnValue({ promise: () => Promise.resolve({ Items: [cartItems[0]] }) });
    mockBatchGet.mockReturnValue({
      promise: () => Promise.resolve({
        Responses: { 'test-products': [products['prod-1']] },
      }),
    });
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: userProfile }) });

    const txError = new Error('Transaction cancelled');
    txError.code = 'TransactionCanceledException';
    // cancellationReasons: [order Put, orderItem Put, stock Update (idx=2), cart Delete]
    txError.cancellationReasons = [
      { Code: 'None' },
      { Code: 'None' },
      { Code: 'ConditionalCheckFailed' },
      { Code: 'None' },
    ];
    mockTransactWrite.mockReturnValue({ promise: () => Promise.reject(txError) });

    const res = await handler(makeCustomerEvent());

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/prod-1/);
  });

  test('403 — no auth context returns 403', async () => {
    const res = await handler(makeUnauthEvent());

    expect(res.statusCode).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
