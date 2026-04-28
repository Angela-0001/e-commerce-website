'use strict';

const { ValidationError } = require('./errors');

// E.164 format: +[country code][number], 7–15 digits total
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

function isValidE164Phone(phone) {
  return typeof phone === 'string' && E164_REGEX.test(phone);
}

function validatePhone(phone) {
  if (!isValidE164Phone(phone)) {
    throw new ValidationError('phoneNumber must be in E.164 format (e.g. +12125551234)');
  }
}

function validatePriceRange(minPrice, maxPrice) {
  if (minPrice !== undefined) {
    const min = Number(minPrice);
    if (isNaN(min) || min < 0) {
      throw new ValidationError('minPrice must be a non-negative number');
    }
  }
  if (maxPrice !== undefined) {
    const max = Number(maxPrice);
    if (isNaN(max) || max < 0) {
      throw new ValidationError('maxPrice must be a non-negative number');
    }
  }
  if (minPrice !== undefined && maxPrice !== undefined) {
    if (Number(minPrice) > Number(maxPrice)) {
      throw new ValidationError('minPrice must not exceed maxPrice');
    }
  }
}

function validatePrice(price) {
  const p = Number(price);
  if (isNaN(p) || p <= 0) {
    throw new ValidationError('price must be a positive number');
  }
}

function validateStock(stock) {
  const s = Number(stock);
  if (!Number.isInteger(s) || s < 0) {
    throw new ValidationError('stockQuantity must be a non-negative integer');
  }
}

/**
 * Validate that all required fields are present and non-empty in the given object.
 * @param {object} obj
 * @param {string[]} fields
 */
function requireFields(obj, fields) {
  const missing = fields.filter(
    (f) => obj[f] === undefined || obj[f] === null || obj[f] === ''
  );
  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
  }
}

module.exports = {
  isValidE164Phone,
  validatePhone,
  validatePriceRange,
  validatePrice,
  validateStock,
  requireFields,
};
