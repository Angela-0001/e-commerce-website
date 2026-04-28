'use strict';

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
  }
}

class NotFoundError extends AppError {
  constructor(msg) { super(404, msg); }
}

class ConflictError extends AppError {
  constructor(msg) { super(409, msg); }
}

class ForbiddenError extends AppError {
  constructor(msg) { super(403, msg); }
}

class ValidationError extends AppError {
  constructor(msg) { super(400, msg); }
}

module.exports = { AppError, NotFoundError, ConflictError, ForbiddenError, ValidationError };
