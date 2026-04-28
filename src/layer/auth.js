'use strict';

const { ForbiddenError } = require('./errors');

/**
 * Extract userId and groups from the API Gateway request context.
 * API Gateway Cognito authorizer populates:
 *   event.requestContext.authorizer.claims.sub          → userId
 *   event.requestContext.authorizer.claims['cognito:groups'] → space-separated group string
 *
 * @param {object} event  - API Gateway Lambda proxy event
 * @returns {{ userId: string, groups: string[] }}
 */
function extractClaims(event) {
  const claims =
    event &&
    event.requestContext &&
    event.requestContext.authorizer &&
    event.requestContext.authorizer.claims;

  if (!claims) {
    throw new ForbiddenError('Missing authorization context');
  }

  const userId = claims.sub;
  if (!userId) {
    throw new ForbiddenError('Missing userId in token claims');
  }

  const rawGroups = claims['cognito:groups'] || '';
  const groups = rawGroups
    ? rawGroups.split(',').map((g) => g.trim()).filter(Boolean)
    : [];

  return { userId, groups };
}

/**
 * Assert that the caller belongs to the Admin group.
 * Throws ForbiddenError if not.
 *
 * @param {object} event  - API Gateway Lambda proxy event
 * @returns {{ userId: string, groups: string[] }}
 */
function requireAdmin(event) {
  const claims = extractClaims(event);
  if (!claims.groups.includes('Admin')) {
    throw new ForbiddenError('Admin access required');
  }
  return claims;
}

module.exports = { extractClaims, requireAdmin };
