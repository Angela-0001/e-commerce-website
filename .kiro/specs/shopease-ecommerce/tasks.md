# Implementation Plan: ShopEase E-Commerce Platform

## Overview

Incremental implementation of the ShopEase serverless e-commerce platform on AWS. Tasks build from shared infrastructure upward through each service, wiring everything together at the end.

## Tasks

- [x] 1. Project structure and Lambda Layer shared utilities
  - Create directory structure: `src/layer/`, `src/functions/`, `tests/unit/`, `tests/property/`
  - Implement `src/layer/response.js` — JSON response builder with `{ "error": "<message>" }` envelope
  - Implement `src/layer/errors.js` — typed error classes (`AppError`, `NotFoundError`, `ConflictError`, `ForbiddenError`, `ValidationError`)
  - Implement `src/layer/validate.js` — input validation helpers (E.164 phone, price range, required fields)
  - Implement `src/layer/dynamo.js` — DynamoDB DocumentClient singleton with retry logic
  - Implement `src/layer/auth.js` — JWT claim extraction (`userId`, `groups`) from API Gateway request context
  - _Requirements: 20.2_

  - [ ]* 1.1 Write unit tests for Lambda Layer utilities
    - Test `response.js` error envelope format
    - Test `validate.js` E.164 phone validation, price range, required field checks
    - Test `errors.js` status code mappings
    - Test `auth.js` claim extraction from mock API Gateway context
    - _Requirements: 20.2_

- [x] 2. Infrastructure as Code — DynamoDB tables and base SAM/CDK template
  - Create `template.yaml` (AWS SAM) with environment `stage` parameter for resource namespacing
  - Define all six DynamoDB tables: `Users`, `Products`, `Categories`, `Carts`, `Orders`, `OrderItems`
  - Add GSIs: `CategoryIndex` on Products, `UserOrdersIndex` and `StatusIndex` on Orders
  - Add template `Outputs` section: API Gateway URL, Cognito User Pool ID, App Client ID, S3 bucket names
  - _Requirements: 18.1–18.7, 22.1–22.4_

- [x] 3. Infrastructure as Code — Cognito, S3, API Gateway, and IAM
  - Add Cognito User Pool and App Client to `template.yaml` with password policy and `Customer`/`Admin` groups
  - Add S3 product images bucket (public access blocked, CORS for PUT, signed URL access only)
  - Add S3 static frontend bucket (static website hosting, public read bucket policy)
  - Add API Gateway with `/v1/` base path, Cognito authorizer, CORS, gateway response error envelope
  - Add JSON Schema request models for all POST/PUT endpoints
  - Add per-function IAM roles with least-privilege DynamoDB and S3 actions
  - _Requirements: 19.1–19.5, 21.1–21.5, 22.1–22.4, 6.1, 6.4, 20.5_

- [x] 4. Auth_Service — registration and email verification
  - Implement `src/functions/auth/register.js` — call Cognito `signUp`, assign `Customer` group, map Cognito exceptions to HTTP responses
  - Implement `src/functions/auth/verify.js` — call Cognito `confirmSignUp`
  - Implement `src/functions/auth/resendVerification.js` — call Cognito `resendConfirmationCode`
  - Implement Cognito Post-Confirmation trigger Lambda `src/functions/auth/postConfirmation.js` — write user profile record to DynamoDB Users table
  - Wire all four functions into `template.yaml` with correct routes and IAM roles
  - _Requirements: 1.1–1.6, 2.1–2.3_

  - [ ]* 4.1 Write property test for registration creates DynamoDB profile
    - **Property 1: Registration creates DynamoDB profile**
    - **Validates: Requirements 1.2**

  - [ ]* 4.2 Write property test for duplicate email rejection
    - **Property 2: Duplicate email registration is rejected**
    - **Validates: Requirements 1.4**

  - [ ]* 4.3 Write property test for invalid password rejection
    - **Property 3: Invalid password is rejected at registration**
    - **Validates: Requirements 1.5**

  - [ ]* 4.4 Write property test for missing required fields rejection
    - **Property 4: Missing required registration fields are rejected**
    - **Validates: Requirements 1.6**

  - [ ]* 4.5 Write property test for email verification confirms account
    - **Property 5: Email verification confirms account**
    - **Validates: Requirements 2.1**

  - [ ]* 4.6 Write property test for invalid verification code rejection
    - **Property 6: Invalid verification code is rejected**
    - **Validates: Requirements 2.2**

  - [ ]* 4.7 Write unit tests for Auth_Service registration and verification
    - Test Cognito error mapping: `UsernameExistsException` → 409, `InvalidPasswordException` → 400, `CodeMismatchException` → 400, `ExpiredCodeException` → 400
    - Test missing field validation (email, password, name, phone)
    - _Requirements: 1.4, 1.5, 1.6, 2.2_

- [x] 5. Auth_Service — login and password reset
  - Implement `src/functions/auth/login.js` — call Cognito `initiateAuth`, return access/ID/refresh tokens, map `NotAuthorizedException` → 401, `UserNotConfirmedException` → 403
  - Implement `src/functions/auth/forgotPassword.js` — call Cognito `forgotPassword`, return HTTP 200 regardless of account existence
  - Implement `src/functions/auth/confirmPassword.js` — call Cognito `confirmForgotPassword`, validate new password policy
  - Wire all three functions into `template.yaml`
  - _Requirements: 3.1–3.4, 4.1–4.4_

  - [ ]* 5.1 Write property test for valid login returns JWT tokens
    - **Property 7: Valid login returns JWT tokens**
    - **Validates: Requirements 3.1**

  - [ ]* 5.2 Write property test for invalid credentials rejection
    - **Property 8: Invalid credentials are rejected**
    - **Validates: Requirements 3.2**

  - [ ]* 5.3 Write property test for unverified account login rejection
    - **Property 9: Unverified account login is rejected**
    - **Validates: Requirements 3.3**

  - [ ]* 5.4 Write property test for password reset round-trip
    - **Property 10: Password reset round-trip**
    - **Validates: Requirements 4.2**

  - [ ]* 5.5 Write property test for invalid reset code rejection
    - **Property 11: Invalid reset code is rejected**
    - **Validates: Requirements 4.3**

  - [ ]* 5.6 Write unit tests for Auth_Service login and password reset
    - Test `UserNotConfirmedException` → 403 mapping
    - Test `UserNotFoundException` → 200 (no enumeration) for forgot-password
    - Test JWT token fields present in login response
    - _Requirements: 3.2, 3.3, 4.4_

- [x] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. User_Service — profile read and update
  - Implement `src/functions/users/getProfile.js` — extract `userId` from JWT context, read from DynamoDB Users table, return profile
  - Implement `src/functions/users/updateProfile.js` — validate fields (E.164 phone), update DynamoDB record, return updated profile; enforce `userId` isolation (HTTP 403 if mismatch)
  - Wire both functions into `template.yaml` with Customer auth and IAM roles
  - _Requirements: 5.1–5.4_

  - [ ]* 7.1 Write property test for user profile CRUD round-trip
    - **Property 12: User profile CRUD round-trip**
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 7.2 Write property test for invalid profile update rejection
    - **Property 13: Invalid profile update is rejected**
    - **Validates: Requirements 5.3**

  - [ ]* 7.3 Write property test for profile access isolation
    - **Property 14: Profile access is isolated per user**
    - **Validates: Requirements 5.4**

  - [ ]* 7.4 Write unit tests for User_Service
    - Test phone number E.164 validation edge cases
    - Test HTTP 403 when `userId` in path differs from JWT claim
    - _Requirements: 5.3, 5.4_

- [x] 8. Role enforcement — Customer cannot invoke Admin-only operations
  - Add `requireAdmin` guard in `src/layer/auth.js` that checks Cognito group from request context and throws `ForbiddenError` if not Admin
  - Apply guard to all Admin-only Lambda handlers (create/update/delete product, update order status, list all orders, create/delete category, get signed URLs)
  - _Requirements: 6.2, 6.3_

  - [ ]* 8.1 Write property test for Customer cannot invoke Admin-only operations
    - **Property 15: Customer cannot invoke Admin-only operations**
    - **Validates: Requirements 6.3**

- [x] 9. Product_Service — categories
  - Implement `src/functions/products/createCategory.js` — validate name, write to DynamoDB Categories table, return HTTP 201 with generated `categoryId`
  - Implement `src/functions/products/listCategories.js` — scan Categories table filtering `isActive = true`
  - Implement `src/functions/products/deleteCategory.js` — check for active products in category (HTTP 409 if found), soft-delete category record
  - Wire all three functions into `template.yaml`
  - _Requirements: 12.1–12.4_

  - [ ]* 9.1 Write property test for category creation round-trip
    - **Property 32: Category creation round-trip**
    - **Validates: Requirements 12.1**

  - [ ]* 9.2 Write property test for category listing returns only active categories
    - **Property 33: Category listing returns only active categories**
    - **Validates: Requirements 12.2**

  - [ ]* 9.3 Write property test for category with active products cannot be deleted
    - **Property 34: Category with active products cannot be deleted**
    - **Validates: Requirements 12.4**

  - [ ]* 9.4 Write unit tests for category operations
    - Test missing category name → HTTP 400
    - Test delete category with no active products succeeds
    - _Requirements: 12.3, 12.4_

- [x] 10. Product_Service — product CRUD
  - Implement `src/functions/products/createProduct.js` — validate required fields (name, description, price > 0, stock >= 0, categoryId, imageKeys), write to DynamoDB, return HTTP 201 with `productId`
  - Implement `src/functions/products/updateProduct.js` — validate fields, update DynamoDB record, return updated product; return HTTP 404 if not found
  - Implement `src/functions/products/deleteProduct.js` — set `isActive = false` (soft delete), return HTTP 204; return HTTP 404 if not found
  - Wire all three functions into `template.yaml` with Admin auth
  - _Requirements: 7.1–7.5_

  - [ ]* 10.1 Write property test for product creation round-trip
    - **Property 16: Product creation round-trip**
    - **Validates: Requirements 7.1**

  - [ ]* 10.2 Write property test for product update round-trip
    - **Property 17: Product update round-trip**
    - **Validates: Requirements 7.2**

  - [ ]* 10.3 Write property test for soft-deleted product excluded from listings
    - **Property 18: Soft-deleted product is excluded from active listings**
    - **Validates: Requirements 7.3**

  - [ ]* 10.4 Write property test for invalid product payload rejection
    - **Property 19: Invalid product payload is rejected**
    - **Validates: Requirements 7.4**

  - [ ]* 10.5 Write property test for non-existent product update/delete returns 404
    - **Property 20: Non-existent product update/delete returns 404**
    - **Validates: Requirements 7.5**

  - [ ]* 10.6 Write unit tests for product CRUD
    - Test negative price → HTTP 400
    - Test non-numeric stock → HTTP 400
    - Test missing required fields → HTTP 400
    - _Requirements: 7.4_

- [x] 11. Product_Service — listing, search, filtering, and detail
  - Implement `src/functions/products/listProducts.js` — paginated scan of active products using `pageSize` (default 20, max 100) and `nextToken` cursor; apply `search`, `categoryId`, `minPrice`, `maxPrice` filters as AND conditions; validate price params
  - Implement `src/functions/products/getProduct.js` — fetch product by `productId`, return HTTP 404 if not found or inactive
  - Wire both functions into `template.yaml` (no auth required)
  - _Requirements: 9.1–9.4, 10.1–10.5, 11.1–11.2_

  - [ ]* 11.1 Write property test for product listing returns only active products
    - **Property 23: Product listing returns only active products**
    - **Validates: Requirements 9.1**

  - [ ]* 11.2 Write property test for pagination correctness
    - **Property 24: Pagination correctness**
    - **Validates: Requirements 9.2, 9.3, 9.4**

  - [ ]* 11.3 Write property test for search filter returns matching active products
    - **Property 25: Search filter returns matching active products**
    - **Validates: Requirements 10.1**

  - [ ]* 11.4 Write property test for category filter
    - **Property 26: Category filter returns only products in that category**
    - **Validates: Requirements 10.2**

  - [ ]* 11.5 Write property test for price range filter
    - **Property 27: Price range filter returns only products within range**
    - **Validates: Requirements 10.3**

  - [ ]* 11.6 Write property test for combined filters apply as AND condition
    - **Property 28: Combined filters apply as AND condition**
    - **Validates: Requirements 10.4**

  - [ ]* 11.7 Write property test for invalid price filter rejection
    - **Property 29: Invalid price filter is rejected**
    - **Validates: Requirements 10.5**

  - [ ]* 11.8 Write property test for product detail round-trip
    - **Property 30: Product detail round-trip**
    - **Validates: Requirements 11.1**

  - [ ]* 11.9 Write property test for inactive/non-existent product detail returns 404
    - **Property 31: Inactive or non-existent product detail returns 404**
    - **Validates: Requirements 11.2**

- [x] 12. Image_Service — signed URL generation
  - Implement `src/functions/images/getUploadUrls.js` — verify product exists (HTTP 404 if not), generate one pre-signed S3 PUT URL per filename with 900-second expiry using AWS SDK, return list of signed URLs
  - Wire function into `template.yaml` with Admin auth and S3 IAM permissions
  - _Requirements: 8.1–8.5_

  - [ ]* 12.1 Write property test for signed URL generation correctness
    - **Property 21: Signed URL generation correctness**
    - **Validates: Requirements 8.1, 8.2**

  - [ ]* 12.2 Write property test for signed URL request for non-existent product returns 404
    - **Property 22: Signed URL request for non-existent product returns 404**
    - **Validates: Requirements 8.5**

  - [ ]* 12.3 Write unit tests for Image_Service
    - Test correct number of URLs returned (one per filename)
    - Test expiry value is exactly 900 seconds
    - _Requirements: 8.1, 8.2_

- [x] 13. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Cart_Service — add, update, and remove items
  - Implement `src/functions/cart/addItem.js` — verify product exists and is active (HTTP 404), check stock (HTTP 409 if exceeded), upsert cart item in DynamoDB (increment if exists)
  - Implement `src/functions/cart/updateItem.js` — if quantity <= 0 delete item, else validate stock and update quantity
  - Implement `src/functions/cart/removeItem.js` — delete cart item from DynamoDB
  - Wire all three functions into `template.yaml` with Customer auth
  - _Requirements: 13.1–13.5_

  - [ ]* 14.1 Write property test for cart add/increment round-trip
    - **Property 35: Cart add/increment round-trip**
    - **Validates: Requirements 13.1**

  - [ ]* 14.2 Write property test for cart quantity update round-trip
    - **Property 36: Cart quantity update round-trip**
    - **Validates: Requirements 13.2**

  - [ ]* 14.3 Write property test for adding non-existent/inactive product returns 404
    - **Property 37: Adding non-existent or inactive product to cart returns 404**
    - **Validates: Requirements 13.3**

  - [ ]* 14.4 Write property test for over-stock cart addition rejection
    - **Property 38: Over-stock cart addition is rejected**
    - **Validates: Requirements 13.4**

  - [ ]* 14.5 Write property test for zero/negative quantity removes cart item
    - **Property 39: Zero or negative quantity removes cart item**
    - **Validates: Requirements 13.5**

- [x] 15. Cart_Service — view cart
  - Implement `src/functions/cart/getCart.js` — query Carts table by `userId`, enrich each item with product name and unit price, compute line totals and grand total, enforce `userId` isolation (HTTP 403)
  - Wire function into `template.yaml` with Customer auth
  - _Requirements: 14.1–14.3_

  - [ ]* 15.1 Write property test for cart totals computed correctly
    - **Property 40: Cart totals are computed correctly**
    - **Validates: Requirements 14.1**

  - [ ]* 15.2 Write property test for cart item deletion round-trip
    - **Property 41: Cart item deletion round-trip**
    - **Validates: Requirements 14.2**

  - [ ]* 15.3 Write property test for cart access isolation
    - **Property 42: Cart access is isolated per user**
    - **Validates: Requirements 14.3**

  - [ ]* 15.4 Write unit tests for Cart_Service
    - Test grand total equals sum of line totals with multiple items
    - Test HTTP 403 when accessing another user's cart
    - _Requirements: 14.1, 14.3_

- [x] 16. Order_Service — order placement
  - Implement `src/functions/orders/placeOrder.js`:
    - Return HTTP 400 if cart is empty
    - Validate all cart items have sufficient stock (HTTP 409 with out-of-stock items if not)
    - Read delivery address from customer's DynamoDB profile
    - Execute DynamoDB `TransactWriteItems`: create order record (status `Pending`), create order item records, decrement stock for each product, delete all cart items
    - Return order ID and summary with HTTP 201
  - Wire function into `template.yaml` with Customer auth and appropriate IAM role
  - _Requirements: 15.1–15.5_

  - [ ]* 16.1 Write property test for order placement atomicity and correctness
    - **Property 43: Order placement atomicity and correctness**
    - **Validates: Requirements 15.1, 15.5**

  - [ ]* 16.2 Write property test for insufficient stock prevents order placement
    - **Property 44: Insufficient stock prevents order placement**
    - **Validates: Requirements 15.3**

  - [ ]* 16.3 Write unit tests for order placement
    - Test empty cart → HTTP 400
    - Test `TransactionCanceledException` with `ConditionalCheckFailed` → HTTP 409 identifying out-of-stock items
    - Test delivery address snapshot matches profile address
    - _Requirements: 15.2, 15.3, 15.4, 15.5_

- [x] 17. Order_Service — order history, detail, and Admin management
  - Implement `src/functions/orders/listOrders.js` — query `UserOrdersIndex` by `userId`, return paginated list (orderId, date, total, status); enforce customer isolation (HTTP 403)
  - Implement `src/functions/orders/getOrder.js` — fetch order and order items by `orderId`, verify ownership (HTTP 403), return full detail
  - Implement `src/functions/orders/updateOrderStatus.js` (Admin) — validate status transition state machine (`Pending→Processing→Shipped→Delivered`), update DynamoDB, return updated order; HTTP 404 if not found, HTTP 400 for invalid transition
  - Implement `src/functions/orders/listAllOrders.js` (Admin) — query `StatusIndex` if status filter provided, else scan Orders table; return paginated list
  - Wire all four functions into `template.yaml`
  - _Requirements: 16.1–16.3, 17.1–17.5_

  - [ ]* 17.1 Write property test for order history isolation
    - **Property 45: Order history is isolated per customer**
    - **Validates: Requirements 16.1, 16.3**

  - [ ]* 17.2 Write property test for order detail round-trip
    - **Property 46: Order detail round-trip**
    - **Validates: Requirements 16.2**

  - [ ]* 17.3 Write property test for order status state machine
    - **Property 47: Order status state machine**
    - **Validates: Requirements 17.2, 17.3**

  - [ ]* 17.4 Write property test for non-existent order status update returns 404
    - **Property 48: Non-existent order status update returns 404**
    - **Validates: Requirements 17.4**

  - [ ]* 17.5 Write property test for Admin order listing respects status filter
    - **Property 49: Admin order listing respects status filter**
    - **Validates: Requirements 17.5**

  - [ ]* 17.6 Write unit tests for Order_Service
    - Test all invalid status transitions return HTTP 400 with valid transitions described
    - Test HTTP 403 when customer accesses another customer's order
    - _Requirements: 17.2, 17.3, 16.3_

- [x] 18. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Wire everything together and validate end-to-end
  - Verify all Lambda functions are registered in `template.yaml` with correct routes, auth, and IAM roles
  - Verify API Gateway Cognito authorizer is attached to all protected routes and absent from public routes (register, login, verify, resend-verification, forgot-password, confirm-password, GET /v1/products, GET /v1/products/{productId}, GET /v1/categories)
  - Verify all environment variables (table names, bucket names, Cognito IDs) are wired from SAM parameters to Lambda environment configs
  - Verify Lambda Layer is referenced by all function definitions in `template.yaml`
  - Verify `template.yaml` Outputs section includes API Gateway URL, Cognito User Pool ID, App Client ID, and S3 bucket names
  - _Requirements: 19.1–19.5, 20.1–20.5, 22.1–22.4_

- [x] 20. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` with a minimum of 100 iterations per property
- Unit tests target 80% line coverage on Lambda handler code
- All Cognito error mappings must have a corresponding unit test
- DynamoDB transactions are used for order placement to guarantee atomicity (Requirement 15.2)
