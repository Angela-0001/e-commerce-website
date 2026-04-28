'use strict';

const { AppError, NotFoundError, ConflictError, ForbiddenError, ValidationError } = require('../../../src/layer/errors');
const response = require('../../../src/layer/response');
const { isValidE164Phone, validatePhone, validatePriceRange, validatePrice, validateStock, requireFields } = require('../../../src/layer/validate');
const { extractClaims, requireAdmin } = require('../../../src/layer/auth');

// ─── errors.js ───────────────────────────────────────────────────────────────

describe('errors.js', () => {
  test('AppError stores statusCode and message', () => {
    const err = new AppError(418, "I'm a teapot");
    expect(err.statusCode).toBe(418);
    expect(err.message).toBe("I'm a teapot");
    expect(err instanceof Error).toBe(true);
  });

  test('NotFoundError has statusCode 404', () => {
    const err = new NotFoundError('not found');
    expect(err.statusCode).toBe(404);
    expect(err instanceof AppError).toBe(true);
  });

  test('ConflictError has statusCode 409', () => {
    const err = new ConflictError('conflict');
    expect(err.statusCode).toBe(409);
  });

  test('ForbiddenError has statusCode 403', () => {
    const err = new ForbiddenError('forbidden');
    expect(err.statusCode).toBe(403);
  });

  test('ValidationError has statusCode 400', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
  });
});

// ─── response.js ─────────────────────────────────────────────────────────────

describe('response.js', () => {
  test('success returns correct statusCode and JSON body', () => {
    const res = response.success(200, { id: '123' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ id: '123' });
  });

  test('error returns error envelope { error: message }', () => {
    const res = response.error(400, 'bad request');
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'bad request' });
  });

  test('error envelope key is exactly "error"', () => {
    const res = response.error(500, 'oops');
    const body = JSON.parse(res.body);
    expect(Object.keys(body)).toEqual(['error']);
  });

  test('response includes Content-Type header', () => {
    const res = response.success(201, {});
    expect(res.headers['Content-Type']).toBe('application/json');
  });
});

// ─── validate.js ─────────────────────────────────────────────────────────────

describe('validate.js — E.164 phone', () => {
  test.each([
    ['+12125551234', true],
    ['+447911123456', true],
    ['+1', false],
    ['12125551234', false],
    ['+0123456789', false],
    ['', false],
    [null, false],
  ])('isValidE164Phone(%s) === %s', (input, expected) => {
    expect(isValidE164Phone(input)).toBe(expected);
  });

  test('validatePhone throws ValidationError for invalid phone', () => {
    expect(() => validatePhone('not-a-phone')).toThrow(ValidationError);
  });

  test('validatePhone does not throw for valid E.164', () => {
    expect(() => validatePhone('+12125551234')).not.toThrow();
  });
});

describe('validate.js — price range', () => {
  test('throws for negative minPrice', () => {
    expect(() => validatePriceRange(-1, undefined)).toThrow(ValidationError);
  });

  test('throws for non-numeric maxPrice', () => {
    expect(() => validatePriceRange(undefined, 'abc')).toThrow(ValidationError);
  });

  test('throws when minPrice > maxPrice', () => {
    expect(() => validatePriceRange(100, 50)).toThrow(ValidationError);
  });

  test('does not throw for valid range', () => {
    expect(() => validatePriceRange(10, 100)).not.toThrow();
  });

  test('does not throw when only minPrice provided', () => {
    expect(() => validatePriceRange(0, undefined)).not.toThrow();
  });
});

describe('validate.js — price', () => {
  test('throws for zero price', () => {
    expect(() => validatePrice(0)).toThrow(ValidationError);
  });

  test('throws for negative price', () => {
    expect(() => validatePrice(-5)).toThrow(ValidationError);
  });

  test('does not throw for positive price', () => {
    expect(() => validatePrice(9.99)).not.toThrow();
  });
});

describe('validate.js — stock', () => {
  test('throws for negative stock', () => {
    expect(() => validateStock(-1)).toThrow(ValidationError);
  });

  test('throws for non-integer stock', () => {
    expect(() => validateStock(1.5)).toThrow(ValidationError);
  });

  test('does not throw for zero stock', () => {
    expect(() => validateStock(0)).not.toThrow();
  });
});

describe('validate.js — requireFields', () => {
  test('throws ValidationError listing missing fields', () => {
    expect(() => requireFields({ name: 'Alice' }, ['name', 'email'])).toThrow(ValidationError);
  });

  test('throws for empty string field', () => {
    expect(() => requireFields({ email: '' }, ['email'])).toThrow(ValidationError);
  });

  test('does not throw when all fields present', () => {
    expect(() => requireFields({ email: 'a@b.com', name: 'Alice' }, ['email', 'name'])).not.toThrow();
  });
});

// ─── auth.js ─────────────────────────────────────────────────────────────────

describe('auth.js — extractClaims', () => {
  function makeEvent(claims) {
    return { requestContext: { authorizer: { claims } } };
  }

  test('extracts userId from sub claim', () => {
    const event = makeEvent({ sub: 'user-123', 'cognito:groups': 'Customer' });
    const { userId } = extractClaims(event);
    expect(userId).toBe('user-123');
  });

  test('extracts groups as array', () => {
    const event = makeEvent({ sub: 'user-123', 'cognito:groups': 'Customer,Admin' });
    const { groups } = extractClaims(event);
    expect(groups).toContain('Customer');
    expect(groups).toContain('Admin');
  });

  test('returns empty groups array when no groups claim', () => {
    const event = makeEvent({ sub: 'user-123' });
    const { groups } = extractClaims(event);
    expect(groups).toEqual([]);
  });

  test('throws ForbiddenError when claims missing', () => {
    expect(() => extractClaims({})).toThrow(ForbiddenError);
  });

  test('throws ForbiddenError when sub missing', () => {
    const event = makeEvent({ 'cognito:groups': 'Customer' });
    expect(() => extractClaims(event)).toThrow(ForbiddenError);
  });
});

describe('auth.js — requireAdmin', () => {
  function makeEvent(claims) {
    return { requestContext: { authorizer: { claims } } };
  }

  test('does not throw for Admin user', () => {
    const event = makeEvent({ sub: 'admin-1', 'cognito:groups': 'Admin' });
    expect(() => requireAdmin(event)).not.toThrow();
  });

  test('throws ForbiddenError for Customer user', () => {
    const event = makeEvent({ sub: 'user-1', 'cognito:groups': 'Customer' });
    expect(() => requireAdmin(event)).toThrow(ForbiddenError);
  });

  test('throws ForbiddenError when no groups', () => {
    const event = makeEvent({ sub: 'user-1' });
    expect(() => requireAdmin(event)).toThrow(ForbiddenError);
  });
});
