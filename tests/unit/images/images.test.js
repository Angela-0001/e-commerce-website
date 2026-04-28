'use strict';

// Virtual module mocks for Lambda Layer paths
jest.mock('/opt/auth', () => require('../../../src/layer/auth'), { virtual: true });
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

const productId = 'prod-img-123';
const activeProduct = { productId, name: 'Test Product', isActive: true };

// ─── getUploadUrls ────────────────────────────────────────────────────────────

describe('getUploadUrls handler', () => {
  let mockGet;
  let mockGetSignedUrlPromise;
  let handler;

  beforeEach(() => {
    jest.resetModules();
    process.env.PRODUCTS_TABLE = 'test-products-table';
    process.env.PRODUCT_IMAGES_BUCKET = 'test-images-bucket';

    mockGet = jest.fn();
    mockGetSignedUrlPromise = jest.fn();

    jest.doMock('/opt/dynamo', () => ({
      getClient: () => ({ get: mockGet }),
    }), { virtual: true });

    jest.doMock('aws-sdk', () => ({
      S3: jest.fn().mockImplementation(() => ({
        getSignedUrlPromise: mockGetSignedUrlPromise,
      })),
    }));

    handler = require('../../../src/functions/images/getUploadUrls').handler;
  });

  afterEach(() => {
    jest.resetModules();
  });

  test('returns 200 with one signed URL per filename', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: activeProduct }) });
    mockGetSignedUrlPromise.mockResolvedValue('https://s3.example.com/signed-url');

    const res = await handler(makeAdminEvent({ filenames: ['photo.jpg'] }, { productId }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].filename).toBe('photo.jpg');
    expect(body[0].uploadUrl).toBe('https://s3.example.com/signed-url');
  });

  test('returns correct number of URLs — one per filename', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: activeProduct }) });
    mockGetSignedUrlPromise
      .mockResolvedValueOnce('https://s3.example.com/url1')
      .mockResolvedValueOnce('https://s3.example.com/url2')
      .mockResolvedValueOnce('https://s3.example.com/url3');

    const filenames = ['a.jpg', 'b.jpg', 'c.jpg'];
    const res = await handler(makeAdminEvent({ filenames }, { productId }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(3);
    expect(body.map((u) => u.filename)).toEqual(filenames);
  });

  test('passes Expires: 900 to getSignedUrlPromise', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: activeProduct }) });
    mockGetSignedUrlPromise.mockResolvedValue('https://s3.example.com/signed-url');

    await handler(makeAdminEvent({ filenames: ['img.png'] }, { productId }));

    expect(mockGetSignedUrlPromise).toHaveBeenCalledWith(
      'putObject',
      expect.objectContaining({ Expires: 900 })
    );
  });

  test('uses correct S3 key format: products/{productId}/{filename}', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: activeProduct }) });
    mockGetSignedUrlPromise.mockResolvedValue('https://s3.example.com/signed-url');

    await handler(makeAdminEvent({ filenames: ['hero.jpg'] }, { productId }));

    expect(mockGetSignedUrlPromise).toHaveBeenCalledWith(
      'putObject',
      expect.objectContaining({
        Bucket: 'test-images-bucket',
        Key: `products/${productId}/hero.jpg`,
        ContentType: 'image/*',
      })
    );
  });

  test('returns 404 when product does not exist', async () => {
    mockGet.mockReturnValue({ promise: () => Promise.resolve({ Item: undefined }) });

    const res = await handler(makeAdminEvent({ filenames: ['photo.jpg'] }, { productId }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found/i);
    expect(mockGetSignedUrlPromise).not.toHaveBeenCalled();
  });

  test('returns 404 when product is inactive', async () => {
    mockGet.mockReturnValue({
      promise: () => Promise.resolve({ Item: { ...activeProduct, isActive: false } }),
    });

    const res = await handler(makeAdminEvent({ filenames: ['photo.jpg'] }, { productId }));

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toMatch(/not found/i);
    expect(mockGetSignedUrlPromise).not.toHaveBeenCalled();
  });

  test('returns 403 when caller is not Admin', async () => {
    const res = await handler(makeCustomerEvent({ filenames: ['photo.jpg'] }, { productId }));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/admin/i);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('returns 400 when filenames array is missing', async () => {
    const res = await handler(makeAdminEvent({}, { productId }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/filenames/i);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test('returns 400 when filenames array is empty', async () => {
    const res = await handler(makeAdminEvent({ filenames: [] }, { productId }));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/filenames/i);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
