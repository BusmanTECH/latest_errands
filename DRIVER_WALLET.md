# Driver Wallet Implementation Guide

## Overview

This document provides comprehensive documentation for implementing and working with driver wallets in the Errands platform. The wallet system is exclusively available for drivers (RIDER role) and provides functionality for managing earnings, funding wallets, and processing withdrawal requests.

## Table of Contents

1. [Entity Structure](#entity-structure)
2. [Wallet Features](#wallet-features)
3. [Service Methods](#service-methods)
4. [API Endpoints](#api-endpoints)
5. [Withdrawal Request System](#withdrawal-request-system)
6. [Integration with Orders & Payments](#integration-with-orders--payments)
7. [Implementation Examples](#implementation-examples)
8. [Use Cases](#use-cases)
9. [Error Handling](#error-handling)
10. [Best Practices](#best-practices)

---

## Entity Structure

### Wallet Entity

Located at `src/wallet/entities/wallet.entity.ts`

```typescript
@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    nullable: false,
  })
  balance: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN', nullable: false })
  currency: string;

  @OneToOne(() => User, (user) => user.wallet, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

**Key Features:**
- One-to-one relationship with User (only drivers)
- Balance stored as decimal (12 digits, 2 decimal places)
- Default currency: NGN (Nigerian Naira)
- Cascade delete: Wallet deleted when user is deleted

### Withdrawal Request Entity

Located at `src/wallet/entities/withdrawal-request.entity.ts`

```typescript
@Entity('withdrawal_requests')
export class WithdrawalRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid', nullable: false })
  userId: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: false,
  })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN', nullable: false })
  currency: string;

  @Column({ type: 'text', nullable: true })
  narration: string;

  @Column({
    type: 'enum',
    enum: WithdrawalStatus,
    default: WithdrawalStatus.PENDING,
    nullable: false,
  })
  status: WithdrawalStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'processedBy' })
  processedBy: User;

  @Column({ type: 'uuid', nullable: true })
  processedByUserId: string;

  @Column({ type: 'timestamp', nullable: true })
  processedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Withdrawal Status Enum

```typescript
export enum WithdrawalStatus {
  PENDING = 'pending',    // Request submitted, awaiting admin approval
  APPROVED = 'approved',  // Request approved, wallet debited
  REJECTED = 'rejected',  // Request rejected by admin
}
```

---

## Wallet Features

### Access Control
- **Exclusive to Drivers**: Only users with `UserRole.RIDER` can have wallets
- **Auto-creation**: Wallet is automatically created when first accessed if it doesn't exist
- **Role validation**: All wallet operations validate user role

### Balance Management
- **Precision**: 12 digits, 2 decimal places (supports up to 9,999,999,999.99)
- **Currency**: Default NGN (Nigerian Naira)
- **Negative Balance**: Optional support with configurable limits
- **Real-time Updates**: Balance updated immediately on credit/debit operations

### Security Features
- **JWT Authentication**: All endpoints require authentication
- **User Isolation**: Drivers can only access their own wallet
- **Admin Oversight**: Withdrawal requests require admin approval
- **Audit Trail**: All operations tracked with timestamps

---

## Service Methods

### WalletService

Located at `src/wallet/wallet.service.ts`

#### 1. `createWallet(userId: string): Promise<Wallet>`

Creates a new wallet for a driver.

**Features:**
- Validates user exists
- Ensures user has RIDER role
- Prevents duplicate wallets
- Initializes balance to 0
- Sets default currency to NGN

**Example:**
```typescript
const wallet = await walletService.createWallet(driverId);
```

#### 2. `getWallet(userId: string): Promise<Wallet>`

Retrieves wallet for a driver. Auto-creates if it doesn't exist.

**Features:**
- Role validation (RIDER only)
- Auto-creation if wallet missing
- Returns wallet with user relation

**Example:**
```typescript
const wallet = await walletService.getWallet(driverId);
console.log(`Balance: ${wallet.balance} ${wallet.currency}`);
```

#### 3. `getWalletBalance(userId: string): Promise<number>`

Gets the current wallet balance as a number.

**Example:**
```typescript
const balance = await walletService.getWalletBalance(driverId);
```

#### 4. `creditWallet(userId: string, amount: number, narration?: string): Promise<Wallet>`

Credits (adds money to) the driver's wallet.

**Features:**
- Validates amount > 0
- Adds amount to current balance
- Role validation included

**Example:**
```typescript
const wallet = await walletService.creditWallet(
  driverId,
  5000.00,
  'Earnings from order #12345'
);
```

#### 5. `debitWallet(userId: string, amount: number, narration?: string, allowNegative?: boolean, negativeLimit?: number): Promise<Wallet>`

Debits (subtracts money from) the driver's wallet.

**Parameters:**
- `allowNegative`: Allow balance to go below zero (default: false)
- `negativeLimit`: Maximum negative balance allowed

**Features:**
- Validates amount > 0
- Checks sufficient balance (unless negative allowed)
- Supports negative balance with limits
- Throws error if insufficient funds

**Example:**
```typescript
// Standard debit (requires sufficient balance)
const wallet = await walletService.debitWallet(
  driverId,
  1000.00,
  'Withdrawal'
);

// Allow negative balance up to -5000
const wallet = await walletService.debitWallet(
  driverId,
  2000.00,
  'Emergency debit',
  true,  // allowNegative
  -5000  // negativeLimit
);
```

#### 6. `creditDriverWalletLedger(userId: string, amount: number): Promise<Wallet>`

Convenience method for crediting driver earnings from orders.

**Example:**
```typescript
await walletService.creditDriverWalletLedger(
  driverId,
  orderAmount * 0.8  // 80% commission
);
```

### Withdrawal Request Methods

#### 7. `createWithdrawalRequest(userId: string, amount: number, narration?: string): Promise<WithdrawalRequest>`

Creates a withdrawal request that requires admin approval.

**Features:**
- Validates amount > 0
- Checks sufficient wallet balance
- Prevents multiple pending requests
- Funds are NOT debited until approval

**Example:**
```typescript
const request = await walletService.createWithdrawalRequest(
  driverId,
  5000.00,
  'Bank account withdrawal'
);
```

#### 8. `getAllWithdrawalRequests(filters?: {...}): Promise<{...}>`

Retrieves withdrawal requests with filtering and pagination.

**Parameters:**
```typescript
{
  status?: WithdrawalStatus;
  userId?: string;
  page?: number;
  pageSize?: number;
}
```

**Returns:**
```typescript
{
  requests: WithdrawalRequest[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

#### 9. `getWithdrawalRequestById(id: string): Promise<WithdrawalRequest>`

Retrieves a specific withdrawal request by ID.

#### 10. `approveWithdrawalRequest(requestId: string, adminUserId: string): Promise<WithdrawalRequest>`

Approves a withdrawal request and debits the wallet.

**Features:**
- Validates request exists and is pending
- Re-checks sufficient balance
- Debits wallet immediately
- Updates request status and processing info

**Example:**
```typescript
const request = await walletService.approveWithdrawalRequest(
  requestId,
  adminUserId
);
```

#### 11. `rejectWithdrawalRequest(requestId: string, adminUserId: string, rejectionReason: string): Promise<WithdrawalRequest>`

Rejects a withdrawal request without debiting wallet.

**Features:**
- Validates request exists and is pending
- Sets rejection reason
- Updates processing info
- Wallet balance remains unchanged

**Example:**
```typescript
const request = await walletService.rejectWithdrawalRequest(
  requestId,
  adminUserId,
  'Insufficient documentation provided'
);
```

---

## API Endpoints

### Base Path: `/wallet`

All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

### Driver Endpoints

#### 1. Get Wallet

**Endpoint:** `GET /wallet`

**Description:** Retrieves wallet information for the authenticated driver.

**Access:** Drivers (RIDER role) only

**Response (200 OK):**
```json
{
  "status": 200,
  "message": "Wallet fetched successfully",
  "data": {
    "id": "wallet-uuid",
    "balance": 15000.50,
    "currency": "NGN",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### 2. Get Wallet Balance

**Endpoint:** `GET /wallet/balance`

**Description:** Returns just the wallet balance as a number.

**Access:** Drivers (RIDER role) only

**Response (200 OK):**
```json
{
  "status": 200,
  "message": "Wallet balance fetched successfully",
  "data": {
    "balance": 15000.50
  }
}
```

#### 3. Fund Wallet

**Endpoint:** `POST /wallet/fund`

**Description:** Initializes wallet funding via Paystack payment gateway.

**Access:** Drivers (RIDER role) only

**Request Body:**
```json
{
  "amount": 5000.00,
  "currency": "NGN",
  "callbackUrl": "https://yourapp.com/payment/callback"
}
```

**Response (200 OK):**
```json
{
  "status": 200,
  "message": "Payment initialized successfully. Redirect to authorization URL to complete payment.",
  "data": {
    "authorizationUrl": "https://paystack.com/pay/...",
    "reference": "PAY-1234567890-ABC123",
    "amount": 5000.00
  }
}
```

**Flow:**
1. Driver calls `/wallet/fund` with amount
2. Paystack payment initialized
3. Driver redirected to `authorizationUrl`
4. After payment, Paystack webhook updates wallet balance
5. Transaction record created automatically

#### 4. Request Withdrawal

**Endpoint:** `POST /wallet/withdraw`

**Description:** Creates a withdrawal request that requires admin approval.

**Access:** Drivers (RIDER role) only

**Request Body:**
```json
{
  "amount": 5000.00,
  "narration": "Bank account withdrawal"
}
```

**Response (201 Created):**
```json
{
  "status": 201,
  "message": "Withdrawal request created successfully. Waiting for admin approval.",
  "data": {
    "id": "withdrawal-request-uuid",
    "userId": "driver-uuid",
    "amount": 5000.00,
    "currency": "NGN",
    "narration": "Bank account withdrawal",
    "status": "pending",
    "rejectionReason": null,
    "processedByUserId": null,
    "processedAt": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Validation:**
- Amount must be > 0
- Wallet balance must be sufficient
- No existing pending withdrawal request

**Notifications:**
- Email notification sent to driver
- Push notification sent
- Admin notified via system

### Admin Endpoints

#### 5. Get All Withdrawal Requests

**Endpoint:** `GET /wallet/admin/withdrawals`

**Description:** Retrieves all withdrawal requests with filtering options.

**Access:** Admin only

**Query Parameters:**
- `status` (optional): Filter by status (`pending`, `approved`, `rejected`)
- `userId` (optional): Filter by driver ID
- `page` (optional): Page number (default: 1)
- `pageSize` (optional): Items per page (default: 20)

**Example:**
```
GET /wallet/admin/withdrawals?status=pending&page=1&pageSize=10
```

**Response (200 OK):**
```json
{
  "status": 200,
  "message": "Withdrawal requests fetched successfully",
  "data": {
    "requests": [
      {
        "id": "request-uuid",
        "userId": "driver-uuid",
        "amount": 5000.00,
        "currency": "NGN",
        "narration": "Bank withdrawal",
        "status": "pending",
        "user": {
          "id": "driver-uuid",
          "firstName": "John",
          "lastName": "Doe",
          "email": "driver@example.com"
        },
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "total": 50,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3
  }
}
```

#### 6. Get Withdrawal Request by ID

**Endpoint:** `GET /wallet/admin/withdrawals/:id`

**Description:** Retrieves a specific withdrawal request.

**Access:** Admin only

**Response (200 OK):**
```json
{
  "status": 200,
  "message": "Withdrawal request fetched successfully",
  "data": {
    "id": "request-uuid",
    "userId": "driver-uuid",
    "amount": 5000.00,
    "currency": "NGN",
    "narration": "Bank withdrawal",
    "status": "pending",
    "user": { ... },
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### 7. Approve Withdrawal Request

**Endpoint:** `POST /wallet/admin/withdrawals/approve`

**Description:** Approves a withdrawal request and debits the driver's wallet.

**Access:** Admin only

**Request Body:**
```json
{
  "withdrawalRequestId": "request-uuid"
}
```

**Response (200 OK):**
```json
{
  "status": 200,
  "message": "Withdrawal request approved successfully",
  "data": {
    "id": "request-uuid",
    "status": "approved",
    "processedByUserId": "admin-uuid",
    "processedAt": "2024-01-01T12:00:00.000Z",
    ...
  }
}
```

**Process:**
1. Validates request exists and is pending
2. Re-checks wallet balance
3. Debits wallet immediately
4. Updates request status to `approved`
5. Sets `processedByUserId` and `processedAt`
6. Sends email and push notification to driver

#### 8. Reject Withdrawal Request

**Endpoint:** `POST /wallet/admin/withdrawals/reject`

**Description:** Rejects a withdrawal request without debiting wallet.

**Access:** Admin only

**Request Body:**
```json
{
  "withdrawalRequestId": "request-uuid",
  "rejectionReason": "Insufficient documentation provided"
}
```

**Response (200 OK):**
```json
{
  "status": 200,
  "message": "Withdrawal request rejected successfully",
  "data": {
    "id": "request-uuid",
    "status": "rejected",
    "rejectionReason": "Insufficient documentation provided",
    "processedByUserId": "admin-uuid",
    "processedAt": "2024-01-01T12:00:00.000Z",
    ...
  }
}
```

**Process:**
1. Validates request exists and is pending
2. Updates request status to `rejected`
3. Sets rejection reason
4. Sets processing info
5. Sends email and push notification to driver
6. Wallet balance remains unchanged

---

## Withdrawal Request System

### Workflow

1. **Driver Creates Request**
   - Driver calls `POST /wallet/withdraw`
   - System validates balance and creates request
   - Status: `PENDING`
   - Email and push notification sent

2. **Admin Reviews Request**
   - Admin views request via `GET /wallet/admin/withdrawals`
   - Admin can see driver details and request history

3. **Admin Approves/Rejects**
   - **Approve**: `POST /wallet/admin/withdrawals/approve`
     - Wallet debited immediately
     - Status: `APPROVED`
     - Driver notified
   - **Reject**: `POST /wallet/admin/withdrawals/reject`
     - Wallet unchanged
     - Status: `REJECTED`
     - Rejection reason stored
     - Driver notified

### Business Rules

1. **One Pending Request**: Driver can only have one pending withdrawal request at a time
2. **Balance Validation**: Request creation checks balance; approval re-checks balance
3. **Immediate Debit**: Wallet is debited immediately upon approval
4. **Audit Trail**: All processing actions tracked with admin ID and timestamp

---

## Integration with Orders & Payments

### Order Completion Flow

When an order is completed and paid:

```typescript
// In order.service.ts - handleOrderCompletion()
async handleOrderCompletion(order: any) {
  // Calculate driver earnings (order amount minus platform commission)
  const orderAmount = order.amount;
  const commissionPercentage = 0.20; // 20% platform fee
  const commissionAmount = orderAmount * commissionPercentage;
  const driverEarnings = orderAmount - commissionAmount;

  // Credit driver wallet
  await this.walletService.creditWallet(
    driverId,
    driverEarnings,
    `Order payment earnings for order ${order.id}`
  );

  // Create transaction record
  await this.transactionService.createTransaction({
    driverId: driverId,
    orderId: order.id,
    type: TransactionType.CREDIT,
    amount: driverEarnings,
    currency: 'NGN',
    narration: `Order payment earnings for order ${order.id}`,
    status: TransactionStatus.SUCCESSFUL,
    reference: `TXN-EARN-${Date.now()}`,
  });
}
```

### Payment Gateway Integration

When order is paid via card:

```typescript
// In payment.controller.ts
private async handleOrderPayment(...) {
  if (verifyPaymentData.status === 'success') {
    // Update order payment status
    await this.orderService.updateOrder(orderId, {
      paymentStatus: 'SUCCESSFUL',
      paidAt: new Date(),
    });

    // Credit driver wallet immediately (for card payments)
    if (updatedOrder.driverId) {
      await this.paymentService.creditRiderEarnings(
        updatedOrder.driverId.toString(),
        Number(updatedOrder.amount)
      );
    }
  }
}
```

### Wallet Payment Flow

When customer pays with wallet:

```typescript
// In order.service.ts - payWithWalletLogic()
async payWithWalletLogic(orderId: string, user: any) {
  // Debit customer wallet
  await this.walletService.debitWallet(
    customerId,
    orderAmount,
    `Payment for order ${orderId}`
  );

  // Credit driver wallet ledger (held until order completion)
  if (order.driver) {
    await this.walletService.creditDriverWalletLedger(
      driverId,
      orderAmount
    );
  }
}
```

---

## Implementation Examples

### Example 1: Get Driver Wallet Balance

```typescript
// In your service
const balance = await walletService.getWalletBalance(driverId);
console.log(`Driver has ${balance} NGN in wallet`);
```

### Example 2: Credit Driver Earnings

```typescript
// After order completion
const driverEarnings = orderAmount * 0.8; // 80% commission

await walletService.creditWallet(
  driverId,
  driverEarnings,
  `Earnings from order ${orderId}`
);

// Also create transaction record
await transactionService.createTransaction({
  driverId: driverId,
  type: TransactionType.CREDIT,
  amount: driverEarnings,
  narration: `Earnings from order ${orderId}`,
  orderId: orderId,
  status: TransactionStatus.SUCCESSFUL,
});
```

### Example 3: Driver Requests Withdrawal

```typescript
// Driver creates withdrawal request
const withdrawalRequest = await walletService.createWithdrawalRequest(
  driverId,
  5000.00,
  'Bank account withdrawal'
);

// Request is now pending admin approval
// Driver's wallet balance is NOT yet debited
```

### Example 4: Admin Approves Withdrawal

```typescript
// Admin approves withdrawal
const approvedRequest = await walletService.approveWithdrawalRequest(
  requestId,
  adminUserId
);

// Wallet is now debited
// Driver receives notification
```

### Example 5: Check Available Balance for Withdrawal

```typescript
// Before allowing withdrawal request
const balance = await walletService.getWalletBalance(driverId);
const requestedAmount = 5000.00;

if (balance < requestedAmount) {
  throw new BadRequestException('Insufficient wallet balance');
}

// Proceed with withdrawal request creation
```

### Example 6: Get All Driver Withdrawals

```typescript
// Get all withdrawal requests for a specific driver
const withdrawals = await walletService.getAllWithdrawalRequests({
  userId: driverId,
  page: 1,
  pageSize: 20,
});

console.log(`Total withdrawals: ${withdrawals.total}`);
console.log(`Pending: ${withdrawals.requests.filter(r => r.status === 'pending').length}`);
```

### Example 7: Calculate Total Earnings

```typescript
// Get wallet balance (includes all credits)
const currentBalance = await walletService.getWalletBalance(driverId);

// Get all successful credit transactions
const transactions = await transactionService.getTransactions(driverId, {
  type: TransactionType.CREDIT,
  status: TransactionStatus.SUCCESSFUL,
});

// Sum all credits
const totalEarnings = transactions.transactions.reduce(
  (sum, txn) => sum + Number(txn.amount),
  0
);

console.log(`Total earnings: ${totalEarnings} NGN`);
console.log(`Current balance: ${currentBalance} NGN`);
```

---

## Use Cases

### 1. Driver Earnings from Order Completion

**Scenario:** Driver completes an order worth 10,000 NGN

**Process:**
1. Order marked as completed
2. Platform calculates commission (e.g., 20% = 2,000 NGN)
3. Driver earnings = 10,000 - 2,000 = 8,000 NGN
4. Wallet credited with 8,000 NGN
5. Transaction record created
6. Driver can view updated balance immediately

### 2. Driver Funds Wallet

**Scenario:** Driver wants to add money to wallet

**Process:**
1. Driver calls `POST /wallet/fund` with amount
2. Paystack payment initialized
3. Driver redirected to payment page
4. After payment, webhook credits wallet
5. Transaction record created
6. Driver receives notification

### 3. Driver Requests Withdrawal

**Scenario:** Driver wants to withdraw 5,000 NGN

**Process:**
1. Driver calls `POST /wallet/withdraw` with amount
2. System validates sufficient balance
3. Withdrawal request created (status: PENDING)
4. Wallet balance NOT debited yet
5. Admin receives notification
6. Driver receives confirmation email

### 4. Admin Approves Withdrawal

**Scenario:** Admin approves driver's withdrawal request

**Process:**
1. Admin reviews request via dashboard
2. Admin calls `POST /wallet/admin/withdrawals/approve`
3. System re-validates balance
4. Wallet debited immediately
5. Request status updated to APPROVED
6. Driver receives notification
7. Admin processes bank transfer (external)

### 5. Admin Rejects Withdrawal

**Scenario:** Admin rejects withdrawal due to insufficient documentation

**Process:**
1. Admin reviews request
2. Admin calls `POST /wallet/admin/withdrawals/reject` with reason
3. Request status updated to REJECTED
4. Rejection reason stored
5. Wallet balance unchanged
6. Driver receives notification with reason

### 6. Driver Checks Balance

**Scenario:** Driver wants to check wallet balance

**Process:**
1. Driver calls `GET /wallet/balance`
2. Returns current balance
3. Can be used for:
   - Displaying in app dashboard
   - Validating withdrawal amount
   - Showing earnings summary

### 7. Multiple Orders Earnings

**Scenario:** Driver completes multiple orders in a day

**Process:**
1. Each order completion credits wallet
2. Balance accumulates
3. Driver can view transaction history
4. Driver can request withdrawal of total balance
5. Admin processes single withdrawal for multiple orders

---

## Error Handling

### Common Errors

#### 1. **Forbidden: Wallet Only for Drivers**
```json
{
  "status": 403,
  "message": "Wallet is only available for drivers"
}
```
**Cause:** User is not a driver (RIDER role)

#### 2. **Insufficient Wallet Balance**
```json
{
  "status": 400,
  "message": "Insufficient wallet balance"
}
```
**Cause:** Trying to debit more than available balance

#### 3. **Pending Withdrawal Request Exists**
```json
{
  "status": 400,
  "message": "You already have a pending withdrawal request. Please wait for it to be processed."
}
```
**Cause:** Driver already has a pending withdrawal request

#### 4. **Invalid Amount**
```json
{
  "status": 400,
  "message": "Amount must be greater than 0"
}
```
**Cause:** Amount is 0 or negative

#### 5. **Withdrawal Request Not Found**
```json
{
  "status": 404,
  "message": "Withdrawal request not found"
}
```
**Cause:** Invalid withdrawal request ID

#### 6. **Request Already Processed**
```json
{
  "status": 400,
  "message": "Withdrawal request is already approved"
}
```
**Cause:** Trying to approve/reject an already processed request

#### 7. **User Not Found**
```json
{
  "status": 404,
  "message": "User not found"
}
```
**Cause:** Invalid user ID

### Error Response Format

All errors follow this format:
```json
{
  "status": 400,
  "message": "Error message description"
}
```

---

## Best Practices

### 1. Always Validate Balance Before Operations

```typescript
// Before withdrawal request
const balance = await walletService.getWalletBalance(driverId);
if (balance < requestedAmount) {
  throw new BadRequestException('Insufficient balance');
}
```

### 2. Create Transaction Records for All Wallet Operations

```typescript
// After crediting wallet
await walletService.creditWallet(driverId, amount, narration);

// Also create transaction record
await transactionService.createTransaction({
  driverId: driverId,
  type: TransactionType.CREDIT,
  amount: amount,
  narration: narration,
  status: TransactionStatus.SUCCESSFUL,
});
```

### 3. Handle Errors Gracefully

```typescript
try {
  await walletService.debitWallet(driverId, amount);
} catch (error) {
  if (error instanceof BadRequestException) {
    // Handle insufficient balance
  } else {
    // Handle other errors
  }
}
```

### 4. Use Appropriate Narration

Always provide clear, descriptive narration:
- ❌ Bad: "Credit"
- ✅ Good: "Earnings from order #12345"
- ✅ Good: "Bank account withdrawal"
- ✅ Good: "Wallet funding via Paystack"

### 5. Monitor Wallet Operations

```typescript
// Log wallet operations for audit
console.log(`[WALLET] Credited ${amount} to driver ${driverId}`);
console.log(`[WALLET] New balance: ${wallet.balance}`);
```

### 6. Re-validate Balance on Approval

```typescript
// In approveWithdrawalRequest
// Always re-check balance before debiting
const wallet = await this.getWallet(request.userId);
if (Number(wallet.balance) < request.amount) {
  throw new BadRequestException('Insufficient balance');
}
```

### 7. Send Notifications

```typescript
// After withdrawal request creation
await notificationService.sendCustomNotification(
  driverId,
  'Withdrawal Request Submitted',
  `Your withdrawal request of ${amount} NGN has been submitted.`,
  'WITHDRAWAL_REQUEST',
  requestId
);
```

### 8. Use Decimal Precision

```typescript
// Always use Number() for decimal operations
const balance = Number(wallet.balance);
const amount = Number(request.amount);
const newBalance = balance - amount;
```

---

## Database Considerations

### Wallet Table
- **Table Name:** `wallets`
- **Indexes:** On `userId` (via OneToOne relationship)
- **Foreign Key:** `userId` → `users.id` (CASCADE DELETE)
- **Precision:** Decimal(12,2) for balance

### Withdrawal Requests Table
- **Table Name:** `withdrawal_requests`
- **Indexes:** 
  - `userId` (for filtering by driver)
  - `status` (for filtering by status)
  - `createdAt` (for sorting)
- **Foreign Keys:**
  - `userId` → `users.id` (CASCADE DELETE)
  - `processedByUserId` → `users.id` (SET NULL)

---

## Testing Examples

### Unit Test Example

```typescript
describe('WalletService - Driver Wallet', () => {
  it('should create wallet for driver', async () => {
    const wallet = await walletService.createWallet(driverId);
    expect(wallet.balance).toBe(0);
    expect(wallet.currency).toBe('NGN');
  });

  it('should credit wallet', async () => {
    await walletService.creditWallet(driverId, 5000, 'Test credit');
    const wallet = await walletService.getWallet(driverId);
    expect(Number(wallet.balance)).toBe(5000);
  });

  it('should reject debit with insufficient balance', async () => {
    await expect(
      walletService.debitWallet(driverId, 10000)
    ).rejects.toThrow('Insufficient wallet balance');
  });
});
```

### API Test Example

```bash
# Get wallet balance
curl -X GET http://localhost:3000/wallet/balance \
  -H "Authorization: Bearer <driver-jwt-token>"

# Fund wallet
curl -X POST http://localhost:3000/wallet/fund \
  -H "Authorization: Bearer <driver-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000.00,
    "callbackUrl": "https://yourapp.com/callback"
  }'

# Request withdrawal
curl -X POST http://localhost:3000/wallet/withdraw \
  -H "Authorization: Bearer <driver-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 3000.00,
    "narration": "Bank withdrawal"
  }'

# Admin: Get all withdrawals
curl -X GET "http://localhost:3000/wallet/admin/withdrawals?status=pending" \
  -H "Authorization: Bearer <admin-jwt-token>"

# Admin: Approve withdrawal
curl -X POST http://localhost:3000/wallet/admin/withdrawals/approve \
  -H "Authorization: Bearer <admin-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "withdrawalRequestId": "request-uuid"
  }'
```

---

## Summary

The driver wallet system provides:

✅ **Exclusive Access**: Only drivers (RIDER role) can have wallets  
✅ **Auto-Creation**: Wallets created automatically on first access  
✅ **Balance Management**: Credit/debit operations with validation  
✅ **Withdrawal System**: Admin-approved withdrawal requests  
✅ **Payment Integration**: Paystack integration for wallet funding  
✅ **Order Integration**: Automatic earnings on order completion  
✅ **Transaction Tracking**: All operations create transaction records  
✅ **Notifications**: Email and push notifications for all actions  
✅ **Audit Trail**: Complete history of all wallet operations  
✅ **Security**: JWT authentication and role-based access control  

This implementation supports all driver financial operations including earnings, wallet funding, balance tracking, and withdrawal management with full admin oversight.

