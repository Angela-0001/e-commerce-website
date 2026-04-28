# Requirements Document

## Introduction

ShopEase is a production-ready, scalable serverless e-commerce platform built on AWS. It supports two roles — Customer and Admin — and provides full shopping lifecycle functionality: browsing products, managing a cart, placing orders, and tracking fulfillment. The platform is built using Amazon API Gateway, AWS Lambda, Amazon DynamoDB, Amazon S3, and Amazon Cognito, deployed via AWS SAM or CDK as infrastructure as code.

---

## Glossary

- **ShopEase**: The overall serverless e-commerce application.
- **Auth_Service**: The Cognito-backed authentication and authorization service.
- **User_Service**: The Lambda-backed service responsible for user profile management.
- **Product_Service**: The Lambda-backed service responsible for product CRUD and search.
- **Cart_Service**: The Lambda-backed service responsible for shopping cart operations.
- **Order_Service**: The Lambda-backed service responsible for order placement and tracking.
- **Image_Service**: The Lambda-backed service responsible for generating signed S3 URLs for image uploads.
- **API_Gateway**: The Amazon API Gateway instance exposing all RESTful endpoints under `/v1/`.
- **Cognito_User_Pool**: The Amazon Cognito User Pool managing user identities, groups, and tokens.
- **DynamoDB**: The Amazon DynamoDB database backing all persistent data.
- **S3**: The Amazon S3 service used for product image storage and static frontend hosting.
- **JWT**: JSON Web Token issued by Cognito and used to authenticate API requests.
- **Customer**: A registered user with the `Customer` Cognito group who can browse, cart, and order.
- **Admin**: A registered user with the `Admin` Cognito group who can manage products and update order statuses.
- **IAM_Role**: An AWS Identity and Access Management role granting least-privilege permissions to each Lambda function.
- **Lambda_Layer**: A shared AWS Lambda layer containing common utility code (validation, error handling, response formatting).
- **Signed_URL**: A time-limited, pre-signed Amazon S3 URL used for secure image upload or download.
- **Order_Status**: The lifecycle state of an order: `Pending`, `Processing`, `Shipped`, or `Delivered`.

---

## Requirements

### Requirement 1: User Registration

**User Story:** As a visitor, I want to register with my email address, so that I can create a ShopEase account and start shopping.

#### Acceptance Criteria

1. WHEN a visitor submits a registration request with a valid email, password, name, and phone number, THE Auth_Service SHALL create a new user in the Cognito_User_Pool and assign the `Customer` group.
2. WHEN a new user is created in Cognito, THE User_Service SHALL create a corresponding user profile record in DynamoDB with the user's name, email, phone number, and an empty address.
3. WHEN a user is registered, THE Auth_Service SHALL trigger an email verification message to the provided email address via Cognito.
4. IF a registration request is submitted with an email address already associated with an existing account, THEN THE Auth_Service SHALL return an HTTP 409 response with a descriptive error message.
5. IF a registration request is submitted with a password that does not meet the minimum policy (at least 8 characters, one uppercase, one number, one special character), THEN THE Auth_Service SHALL return an HTTP 400 response with a descriptive error message.
6. IF a registration request is missing any required field (email, password, name, phone number), THEN THE Auth_Service SHALL return an HTTP 400 response identifying the missing fields.

---

### Requirement 2: Email Verification

**User Story:** As a newly registered user, I want to verify my email address, so that my account is activated and secured.

#### Acceptance Criteria

1. WHEN a user submits a valid verification code sent to their email, THE Auth_Service SHALL mark the Cognito account as confirmed.
2. IF a user submits an incorrect or expired verification code, THEN THE Auth_Service SHALL return an HTTP 400 response with a descriptive error message.
3. WHEN a user requests a new verification code, THE Auth_Service SHALL resend the verification email via Cognito.

---

### Requirement 3: User Login

**User Story:** As a registered user, I want to log in with my email and password, so that I can access my account and protected features.

#### Acceptance Criteria

1. WHEN a user submits valid credentials, THE Auth_Service SHALL return a Cognito-issued JWT access token, ID token, and refresh token.
2. IF a user submits invalid credentials, THEN THE Auth_Service SHALL return an HTTP 401 response with a descriptive error message.
3. IF a user submits credentials for an unverified account, THEN THE Auth_Service SHALL return an HTTP 403 response indicating email verification is required.
4. THE API_Gateway SHALL reject requests to protected endpoints that do not include a valid JWT in the `Authorization` header with an HTTP 401 response.

---

### Requirement 4: Password Reset

**User Story:** As a user who has forgotten their password, I want to reset it via email, so that I can regain access to my account.

#### Acceptance Criteria

1. WHEN a user submits a password reset request with a registered email, THE Auth_Service SHALL send a password reset code to that email via Cognito.
2. WHEN a user submits a valid reset code and a new password that meets the password policy, THE Auth_Service SHALL update the user's password in the Cognito_User_Pool.
3. IF a user submits a password reset confirmation with an invalid or expired code, THEN THE Auth_Service SHALL return an HTTP 400 response with a descriptive error message.
4. IF a password reset request is submitted for an email not associated with any account, THEN THE Auth_Service SHALL return an HTTP 200 response without revealing whether the account exists (to prevent user enumeration).

---

### Requirement 5: User Profile Management

**User Story:** As a logged-in Customer, I want to view and update my profile, so that my personal details and delivery address are current.

#### Acceptance Criteria

1. WHEN a Customer sends an authenticated GET request to retrieve their profile, THE User_Service SHALL return the user's name, email, phone number, and address from DynamoDB.
2. WHEN a Customer sends an authenticated PUT request with updated name, phone number, or address fields, THE User_Service SHALL update the corresponding record in DynamoDB and return the updated profile.
3. IF a profile update request contains invalid data (e.g., phone number not matching E.164 format), THEN THE User_Service SHALL return an HTTP 400 response with a descriptive error message.
4. THE User_Service SHALL prevent a Customer from reading or modifying another user's profile, returning HTTP 403 if attempted.

---

### Requirement 6: Admin and Customer Role Enforcement

**User Story:** As a platform operator, I want role-based access control, so that Admins and Customers can only access the operations appropriate to their role.

#### Acceptance Criteria

1. THE API_Gateway SHALL use a Cognito authorizer to validate the JWT on all protected routes before invoking any Lambda function.
2. WHEN an authenticated request is received, THE API_Gateway SHALL pass the user's Cognito group membership to the invoked Lambda function via the request context.
3. IF a Customer attempts to invoke an Admin-only operation (e.g., create product, update order status), THEN THE respective service SHALL return an HTTP 403 response.
4. IF an unauthenticated request is made to a protected endpoint, THEN THE API_Gateway SHALL return an HTTP 401 response before invoking any Lambda function.

---

### Requirement 7: Product Creation and Management (Admin)

**User Story:** As an Admin, I want to create, update, and delete products, so that the product catalog stays accurate and up to date.

#### Acceptance Criteria

1. WHEN an Admin sends an authenticated POST request with a product name, description, price, stock quantity, category ID, and at least one image key, THE Product_Service SHALL create a new product record in DynamoDB and return the generated product ID with HTTP 201.
2. WHEN an Admin sends an authenticated PUT request for an existing product with updated fields, THE Product_Service SHALL update the product record in DynamoDB and return the updated product.
3. WHEN an Admin sends an authenticated DELETE request for an existing product, THE Product_Service SHALL mark the product as inactive in DynamoDB (soft delete) and return HTTP 204.
4. IF a product creation or update request is missing required fields or contains invalid data (e.g., negative price, non-numeric stock), THEN THE Product_Service SHALL return an HTTP 400 response with a descriptive error message.
5. IF an Admin attempts to update or delete a product that does not exist, THEN THE Product_Service SHALL return an HTTP 404 response.

---

### Requirement 8: Product Image Upload

**User Story:** As an Admin, I want to upload multiple images for a product, so that customers can see what they are buying.

#### Acceptance Criteria

1. WHEN an Admin sends an authenticated POST request specifying a product ID and a list of image filenames, THE Image_Service SHALL generate a Signed_URL for each filename pointing to the product images S3 bucket and return the list of Signed_URLs with HTTP 200.
2. THE Image_Service SHALL generate Signed_URLs that expire after no more than 15 minutes.
3. THE S3 product images bucket SHALL NOT be publicly accessible; all image access SHALL be via Signed_URLs.
4. WHEN an Admin uploads an image using a Signed_URL, THE S3 bucket SHALL accept only files with MIME types `image/jpeg`, `image/png`, or `image/webp` via S3 bucket policy conditions.
5. IF a Signed_URL request is made for a product ID that does not exist, THEN THE Image_Service SHALL return an HTTP 404 response.

---

### Requirement 9: Product Listing with Pagination

**User Story:** As a Customer, I want to browse all available products with pagination, so that I can explore the catalog without loading everything at once.

#### Acceptance Criteria

1. WHEN a GET request is made to the products list endpoint, THE Product_Service SHALL return a paginated list of active products from DynamoDB, including product ID, name, price, category, stock quantity, and primary image key.
2. THE Product_Service SHALL accept a `pageSize` query parameter (default 20, maximum 100) and a `nextToken` cursor parameter for pagination.
3. WHEN a paginated response has additional results, THE Product_Service SHALL include a `nextToken` value in the response for the caller to retrieve the next page.
4. WHEN the last page of results is returned, THE Product_Service SHALL omit the `nextToken` field from the response.

---

### Requirement 10: Product Search and Filtering

**User Story:** As a Customer, I want to search and filter products, so that I can quickly find what I am looking for.

#### Acceptance Criteria

1. WHEN a GET request includes a `search` query parameter, THE Product_Service SHALL return active products whose name or category name contains the search term (case-insensitive).
2. WHEN a GET request includes `categoryId` query parameter, THE Product_Service SHALL return only active products belonging to that category.
3. WHEN a GET request includes `minPrice` and/or `maxPrice` query parameters, THE Product_Service SHALL return only active products whose price falls within the specified range (inclusive).
4. WHEN multiple filter parameters are provided simultaneously, THE Product_Service SHALL apply all filters as a combined AND condition.
5. IF a `minPrice` or `maxPrice` value is non-numeric or negative, THEN THE Product_Service SHALL return an HTTP 400 response with a descriptive error message.

---

### Requirement 11: Product Detail Retrieval

**User Story:** As a Customer, I want to view the full details of a product, so that I can make an informed purchase decision.

#### Acceptance Criteria

1. WHEN a GET request is made for a specific product ID, THE Product_Service SHALL return the product's name, description, price, stock quantity, category, and all image keys.
2. IF the requested product ID does not exist or is inactive, THEN THE Product_Service SHALL return an HTTP 404 response.

---

### Requirement 12: Product Categories

**User Story:** As an Admin, I want to manage product categories, so that products are organized for easy browsing.

#### Acceptance Criteria

1. WHEN an Admin sends an authenticated POST request with a category name, THE Product_Service SHALL create a new category record in DynamoDB and return the generated category ID with HTTP 201.
2. WHEN a GET request is made to the categories endpoint, THE Product_Service SHALL return all active categories from DynamoDB.
3. IF a category creation request is missing the category name, THEN THE Product_Service SHALL return an HTTP 400 response.
4. IF an Admin attempts to delete a category that has active products assigned to it, THEN THE Product_Service SHALL return an HTTP 409 response indicating the category is in use.

---

### Requirement 13: Shopping Cart — Add and Update Items

**User Story:** As a Customer, I want to add products to my cart and adjust quantities, so that I can prepare my order before checkout.

#### Acceptance Criteria

1. WHEN an authenticated Customer sends a POST request with a product ID and quantity, THE Cart_Service SHALL add the item to the customer's cart in DynamoDB, or increment the quantity if the item already exists.
2. WHEN an authenticated Customer sends a PUT request for an existing cart item with a new quantity, THE Cart_Service SHALL update the item quantity in DynamoDB.
3. IF a Customer attempts to add a product that does not exist or is inactive, THEN THE Cart_Service SHALL return an HTTP 404 response.
4. IF a Customer attempts to add or update a cart item with a quantity that exceeds the product's available stock, THEN THE Cart_Service SHALL return an HTTP 409 response indicating insufficient stock.
5. IF a quantity of zero or less is submitted in an update request, THEN THE Cart_Service SHALL remove the item from the cart.

---

### Requirement 14: Shopping Cart — View and Remove Items

**User Story:** As a Customer, I want to view my cart and remove items, so that I have full control over what I am about to purchase.

#### Acceptance Criteria

1. WHEN an authenticated Customer sends a GET request to the cart endpoint, THE Cart_Service SHALL return all cart items for that customer, including product name, unit price, quantity, and line total, along with the cart grand total.
2. WHEN an authenticated Customer sends a DELETE request for a specific cart item, THE Cart_Service SHALL remove that item from the cart in DynamoDB.
3. THE Cart_Service SHALL ensure a Customer can only view and modify their own cart, returning HTTP 403 if another user's cart is accessed.

---

### Requirement 15: Order Placement

**User Story:** As a Customer, I want to place an order from my cart, so that I can purchase the items I have selected.

#### Acceptance Criteria

1. WHEN an authenticated Customer sends a POST request to place an order, THE Order_Service SHALL validate that all cart items have sufficient stock, create an order record in DynamoDB with a unique order ID and status `Pending`, create corresponding order item records, decrement the stock quantity of each ordered product in DynamoDB, clear the customer's cart, and return the order ID and summary with HTTP 201.
2. THE Order_Service SHALL perform the stock decrement and cart clear as an atomic operation using DynamoDB transactions to prevent partial updates.
3. IF any cart item has insufficient stock at the time of order placement, THEN THE Order_Service SHALL return an HTTP 409 response identifying the out-of-stock items without placing the order or modifying any stock.
4. IF the customer's cart is empty at the time of order placement, THEN THE Order_Service SHALL return an HTTP 400 response.
5. WHEN an order is created, THE Order_Service SHALL record the delivery address from the customer's profile at the time of order placement.

---

### Requirement 16: Order History and Detail

**User Story:** As a Customer, I want to view my order history and the details of each order, so that I can track my purchases.

#### Acceptance Criteria

1. WHEN an authenticated Customer sends a GET request to the orders endpoint, THE Order_Service SHALL return a paginated list of that customer's orders, including order ID, placement date, total amount, and current status.
2. WHEN an authenticated Customer sends a GET request for a specific order ID, THE Order_Service SHALL return the full order details including all items, quantities, unit prices, total amount, delivery address, and current status.
3. THE Order_Service SHALL prevent a Customer from accessing another customer's order, returning HTTP 403 if attempted.

---

### Requirement 17: Order Status Management (Admin)

**User Story:** As an Admin, I want to update the status of orders, so that customers are kept informed about their fulfillment progress.

#### Acceptance Criteria

1. WHEN an Admin sends an authenticated PUT request for an order with a new status value, THE Order_Service SHALL update the order's status in DynamoDB and return the updated order.
2. THE Order_Service SHALL only accept the following status transitions: `Pending` → `Processing`, `Processing` → `Shipped`, `Shipped` → `Delivered`.
3. IF an Admin submits an invalid status transition (e.g., `Pending` → `Delivered`), THEN THE Order_Service SHALL return an HTTP 400 response describing the valid transitions.
4. IF an Admin attempts to update the status of an order that does not exist, THEN THE Order_Service SHALL return an HTTP 404 response.
5. WHEN an Admin sends a GET request to the admin orders endpoint, THE Order_Service SHALL return a paginated list of all orders across all customers, filterable by status.

---

### Requirement 18: DynamoDB Schema

**User Story:** As a platform engineer, I want a well-defined DynamoDB schema with appropriate keys and indexes, so that all access patterns are efficiently supported.

#### Acceptance Criteria

1. THE DynamoDB SHALL contain a `Users` table with partition key `userId` (String).
2. THE DynamoDB SHALL contain a `Products` table with partition key `productId` (String), and a Global Secondary Index `CategoryIndex` on `categoryId` (partition key) and `createdAt` (sort key).
3. THE DynamoDB SHALL contain a `Categories` table with partition key `categoryId` (String).
4. THE DynamoDB SHALL contain a `Carts` table with partition key `userId` (String) and sort key `productId` (String).
5. THE DynamoDB SHALL contain an `Orders` table with partition key `orderId` (String), and a Global Secondary Index `UserOrdersIndex` on `userId` (partition key) and `createdAt` (sort key).
6. THE DynamoDB SHALL contain an `OrderItems` table with partition key `orderId` (String) and sort key `productId` (String).
7. THE DynamoDB `Orders` table SHALL include a Global Secondary Index `StatusIndex` on `status` (partition key) and `createdAt` (sort key) to support Admin order filtering by status.

---

### Requirement 19: API Gateway Configuration

**User Story:** As a platform engineer, I want a properly configured API Gateway, so that all endpoints are secure, validated, and versioned.

#### Acceptance Criteria

1. THE API_Gateway SHALL expose all endpoints under the `/v1/` path prefix.
2. THE API_Gateway SHALL enable CORS on all endpoints, allowing the configured frontend origin, with `Authorization` included in allowed headers.
3. THE API_Gateway SHALL attach a Cognito authorizer to all endpoints except user registration, login, email verification, password reset, public product listing, and public product detail.
4. THE API_Gateway SHALL perform request body validation using JSON Schema models for all POST and PUT endpoints, returning HTTP 400 for invalid request bodies before invoking Lambda.
5. THE API_Gateway SHALL return a consistent JSON error envelope `{ "error": "<message>" }` for all 4xx and 5xx responses.

---

### Requirement 20: Lambda Function Architecture

**User Story:** As a platform engineer, I want each Lambda function to be independently deployable with shared code in a Lambda Layer, so that the codebase is maintainable and consistent.

#### Acceptance Criteria

1. THE ShopEase platform SHALL implement one Lambda function per API operation (e.g., `createProduct`, `listProducts`, `addToCart`, `placeOrder`).
2. THE ShopEase platform SHALL package shared utility code (input validation, error response formatting, DynamoDB client initialization, JWT claim extraction) into a single Lambda_Layer used by all functions.
3. WHEN a Lambda function encounters an unhandled exception, THE Lambda function SHALL return an HTTP 500 response with a generic error message and log the full exception details to Amazon CloudWatch.
4. THE Lambda functions SHALL read all environment-specific configuration (DynamoDB table names, S3 bucket names, Cognito User Pool ID) from environment variables.
5. EACH Lambda function SHALL be assigned a dedicated IAM_Role granting only the DynamoDB actions and S3 actions required for that specific function (least privilege).

---

### Requirement 21: S3 Storage Configuration

**User Story:** As a platform engineer, I want S3 buckets properly configured for security and CORS, so that image uploads and frontend hosting work correctly and securely.

#### Acceptance Criteria

1. THE S3 product images bucket SHALL have all public access blocked at the bucket level.
2. THE S3 product images bucket SHALL have a CORS configuration permitting PUT requests from the configured frontend origin with `Content-Type` in allowed headers.
3. THE S3 static frontend bucket SHALL be configured for static website hosting and SHALL serve the frontend application.
4. THE S3 static frontend bucket SHALL have a bucket policy permitting public read access only to objects within the bucket (not bucket-level operations).
5. THE Image_Service SHALL generate Signed_URLs using the AWS SDK with an expiry of 900 seconds (15 minutes).

---

### Requirement 22: Infrastructure as Code Deployment

**User Story:** As a platform engineer, I want all AWS resources defined as code and deployable with a single command, so that the environment is reproducible and version-controlled.

#### Acceptance Criteria

1. THE ShopEase platform SHALL define all AWS resources (Lambda functions, API Gateway, DynamoDB tables, S3 buckets, Cognito User Pool, IAM roles) in a single AWS SAM template (`template.yaml`) or AWS CDK application.
2. WHEN the deployment command is executed, THE deployment tooling SHALL provision or update all defined resources in the target AWS account and region without manual console steps.
3. THE deployment template SHALL accept parameters for environment name (e.g., `dev`, `staging`, `prod`) and use them to namespace all resource names.
4. THE deployment template SHALL output the API Gateway base URL, Cognito User Pool ID, Cognito App Client ID, and S3 bucket names upon successful deployment.

---

### Requirement 23: Documentation

**User Story:** As a developer onboarding to ShopEase, I want comprehensive documentation, so that I can understand, deploy, and extend the platform.

#### Acceptance Criteria

1. THE ShopEase repository SHALL include a `README.md` with architecture overview, prerequisites, setup instructions, and a single-command deployment guide.
2. THE ShopEase repository SHALL include an API reference document listing every endpoint with HTTP method, path, request schema, response schema, authentication requirement, and example request/response.
3. THE ShopEase repository SHALL include a DynamoDB schema document describing each table's partition key, sort key, attributes, and all Global Secondary Indexes.
4. THE ShopEase repository SHALL include a Postman collection JSON file covering all API endpoints with example requests.
5. THE ShopEase repository SHALL include an architecture diagram (as an image or diagram-as-code file) illustrating the interaction between API Gateway, Lambda, DynamoDB, S3, and Cognito.
