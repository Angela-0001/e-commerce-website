'use strict';

// Virtual module mocks for Lambda Layer paths
jest.mock('/opt/auth', () => require('../../../src/layer/auth'), { virtual: true });
jest.mock('/opt/errors', () => require('../../../src/layer/errors'), { virtual: true });
jest.mock('/opt/response', () => require('../../../src/layer/response'), { virtual: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCustomerEvent(overrides = {}) {
  return {
    requestContext: {
      authorizer: {
        claims: {
          sub: 'user-123',
          'cognito:groups': 'Customer',
        },
      },
    },
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    ...overrides,
  };
}

function makeAdminEvent(overrides = {}) {
  return {
    requestContext: {
      authorizer: {
        claims: {
          sub: 'admin-456',
          'cognito:groups': 'Admin',
        },
      },
    },
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    ...overrides,
  };
}

function makeUnauthEvent() {
  return { requestContext: {}, pathParameters: null, queryStringParameters: null, body: null };
}

const sampleOrders = [
  { orderId: 'order-1', userId: 'user-123', status: 'Pending', totalAmount: 50, createdAt: '2024-01-02T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z', deliveryAddress: { street: '1 Main St' } },
  { orderId: 'order-2', userId: 'user-123', status: 'Shipped', totalAmount: 30, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', deliveryAddress: { street: '1 Main St' } },
];

const sampleOrderItems = [
  { orderId: 'order-1', productId: 'prod-1', productName: 'Widget', unitPrice: 10, quantity: 2, lineTotal: 20 },
  { orderId: 'order-1', productId: 'prod-2', productName: 'Gadget', unitPrice: 30, quantity: 1, lineTotal: 30 },
];

// ─── listOrders ───────────────────────────────────────────────────────────────

describe('listOrders handler', () => {
  let mockQuery;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.ORDERS_TABLE = 'test-orders';

    mockQuery = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ query: mockQuery }),
    }), { virtual: true });

    handler = require('../../../src/functions/orders/listOrders').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('200 — returns list of orders for authenticated user', async () => {
    mockQuery.mockReturnValue({
      promise: () => Promise.resolve({ Items: sampleOrders }),
    });

    const res = await handler(makeCustomerEvent());

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ orderId: 'order-1', status: 'Pending', totalAmount: 50 });
    expect(body.nextToken).toBeUndefined();
  });

  test('200 — returns nextToken when LastEvaluatedKey is present', async () => {
    const lastKey = { orderId: 'order-2', userId: 'user-123', createdAt: '2024-01-01T00:00:00Z' };
    mockQuery.mockReturnValue({
      promise: () => Promise.resolve({ Items: [sampleOrders[0]], LastEvaluatedKey: lastKey }),
    });

    const res = await handler(makeCustomerEvent({ queryStringParameters: { pageSize: '1' } }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(1);
    expect(body.nextToken).toBeDefined();
    // nextToken should be base64-encoded JSON of the LastEvaluatedKey
    const decoded = JSON.parse(Buffer.from(body.nextToken, 'base64').toString('utf8'));
    expect(decoded).toEqual(lastKey);
  });

  test('200 — uses nextToken from query string as ExclusiveStartKey', async () => {
    const startKey = { orderId: 'order-2', userId: 'user-123', createdAt: '2024-01-01T00:00:00Z' };
    const token = Buffer.from(JSON.stringify(startKey)).toString('base64');
    mockQuery.mockReturnValue({
      promise: () => Promise.resolve({ Items: [sampleOrders[1]] }),
    });

    const res = await handler(makeCustomerEvent({ queryStringParameters: { nextToken: token } }));

    expect(res.statusCode).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ ExclusiveStartKey: startKey })
    );
  });

  test('403 — no auth context returns 403', async () => {
    const res = await handler(makeUnauthEvent());

    expect(res.statusCode).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('200 — caps pageSize at 100', async () => {
    mockQuery.mockReturnValue({ promise: () => Promise.resolve({ Items: [] }) });

    await handler(makeCustomerEvent({ queryStringParameters: { pageSize: '500' } }));

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ Limit: 100 }));
  });
});

// ─── getOrder ─────────────────────────────────────────────────────────────────

describe('getOrder handler', () => {
  let mockGet;
  let mockQuery;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.ORDERS_TABLE = 'test-orders';
    process.env.ORDER_ITEMS_TABLE = 'test-order-items';

    mockGet = jest.fn();
    mockQuery = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ get: mockGet, query: mockQuery }),
    }), { virtual: true });

    handler = require('../../../src/functions/orders/getOrder').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('200 — returns full order detail with items', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: sampleOrders[0] }) });
    mockQuery.mockReturnValue({ promise: () => Promise.resolve({ Items: sampleOrderItems }) });

    const res = await handler(makeCustomerEvent({ pathParameters: { orderId: 'order-1' } }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.orderId).toBe('order-1');
    expect(body.userId).toBe('user-123');
    expect(body.status).toBe('Pending');
    expect(body.totalAmount).toBe(50);
    expect(body.deliveryAddress).toEqual({ street: '1 Main St' });
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ productId: 'prod-1', quantity: 2 });
  });

  test('404 — order not found returns 404', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: undefined }) });

    const res = await handler(makeCustomerEvent({ pathParameters: { orderId: 'nonexistent' } }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found/i);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('403 — order belongs to different user returns 403', async () => {
    const otherUserOrder = { ...sampleOrders[0], userId: 'other-user' };
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: otherUserOrder }) });

    const res = await handler(makeCustomerEvent({ pathParameters: { orderId: 'order-1' } }));

    expect(res.statusCode).toBe(403);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('403 — no auth context returns 403', async () => {
    const res = await handler({ ...makeUnauthEvent(), pathParameters: { orderId: 'order-1' } });

    expect(res.statusCode).toBe(403);
    expect(mockGet).not.toHaveBeenCalled();
  });
});

// ─── updateOrderStatus ────────────────────────────────────────────────────────

describe('updateOrderStatus handler', () => {
  let mockGet;
  let mockUpdate;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.ORDERS_TABLE = 'test-orders';

    mockGet = jest.fn();
    mockUpdate = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ get: mockGet, update: mockUpdate }),
    }), { virtual: true });

    handler = require('../../../src/functions/orders/updateOrderStatus').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('200 — Pending → Processing is a valid transition', async () => {
    const order = { ...sampleOrders[0], status: 'Pending' };
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: order }) });
    mockUpdate.mockReturnValue({ promise: () => Promise.resolve({}) });

    const res = await handler(makeAdminEvent({
      pathParameters: { orderId: 'order-1' },
      body: JSON.stringify({ status: 'Processing' }),
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('Processing');
    expect(mockUpdate).toHaveBeenCalled();
  });

  test('200 — Processing → Shipped is a valid transition', async () => {
    const order = { ...sampleOrders[0], status: 'Processing' };
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: order }) });
    mockUpdate.mockReturnValue({ promise: () => Promise.resolve({}) });

    const res = await handler(makeAdminEvent({
      pathParameters: { orderId: 'order-1' },
      body: JSON.stringify({ status: 'Shipped' }),
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('Shipped');
  });

  test('200 — Shipped → Delivered is a valid transition', async () => {
    const order = { ...sampleOrders[0], status: 'Shipped' };
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: order }) });
    mockUpdate.mockReturnValue({ promise: () => Promise.resolve({}) });

    const res = await handler(makeAdminEvent({
      pathParameters: { orderId: 'order-1' },
      body: JSON.stringify({ status: 'Delivered' }),
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('Delivered');
  });

  test('400 — Pending → Delivered is an invalid transition (skipping)', async () => {
    const order = { ...sampleOrders[0], status: 'Pending' };
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: order }) });

    const res = await handler(makeAdminEvent({
      pathParameters: { orderId: 'order-1' },
      body: JSON.stringify({ status: 'Delivered' }),
    }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/invalid status transition/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('400 — Delivered → any is an invalid transition (terminal state)', async () => {
    const order = { ...sampleOrders[0], status: 'Delivered' };
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: order }) });

    const res = await handler(makeAdminEvent({
      pathParameters: { orderId: 'order-1' },
      body: JSON.stringify({ status: 'Shipped' }),
    }));

    expect(res.statusCode).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('404 — order not found returns 404', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: undefined }) });

    const res = await handler(makeAdminEvent({
      pathParameters: { orderId: 'nonexistent' },
      body: JSON.stringify({ status: 'Processing' }),
    }));

    expect(res.statusCode).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('403 — non-admin (Customer) returns 403', async () => {
    const res = await handler(makeCustomerEvent({
      pathParameters: { orderId: 'order-1' },
      body: JSON.stringify({ status: 'Processing' }),
    }));

    expect(res.statusCode).toBe(403);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('403 — no auth context returns 403', async () => {
    const res = await handler({ ...makeUnauthEvent(), pathParameters: { orderId: 'order-1' }, body: JSON.stringify({ status: 'Processing' }) });

    expect(res.statusCode).toBe(403);
    expect(mockGet).not.toHaveBeenCalled();
  });
});

// ─── listAllOrders ────────────────────────────────────────────────────────────

describe('listAllOrders handler', () => {
  let mockQuery;
  let mockScan;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.ORDERS_TABLE = 'test-orders';

    mockQuery = jest.fn();
    mockScan = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ query: mockQuery, scan: mockScan }),
    }), { virtual: true });

    handler = require('../../../src/functions/orders/listAllOrders').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('200 — returns all orders via scan when no status filter', async () => {
    mockScan.mockReturnValue({ promise: () => Promise.resolve({ Items: sampleOrders }) });

    const res = await handler(makeAdminEvent());

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(2);
    expect(mockScan).toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('200 — filters by status using StatusIndex query', async () => {
    const pendingOrders = [sampleOrders[0]];
    mockQuery.mockReturnValue({ promise: () => Promise.resolve({ Items: pendingOrders }) });

    const res = await handler(makeAdminEvent({ queryStringParameters: { status: 'Pending' } }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].status).toBe('Pending');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ IndexName: 'StatusIndex' })
    );
    expect(mockScan).not.toHaveBeenCalled();
  });

  test('200 — returns nextToken when more results exist', async () => {
    const lastKey = { orderId: 'order-1', status: 'Pending', createdAt: '2024-01-02T00:00:00Z' };
    mockScan.mockReturnValue({
      promise: () => Promise.resolve({ Items: [sampleOrders[0]], LastEvaluatedKey: lastKey }),
    });

    const res = await handler(makeAdminEvent({ queryStringParameters: { pageSize: '1' } }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.nextToken).toBeDefined();
  });

  test('403 — non-admin (Customer) returns 403', async () => {
    const res = await handler(makeCustomerEvent());

    expect(res.statusCode).toBe(403);
    expect(mockScan).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('403 — no auth context returns 403', async () => {
    const res = await handler(makeUnauthEvent());

    expect(res.statusCode).toBe(403);
    expect(mockScan).not.toHaveBeenCalled();
  });
});
