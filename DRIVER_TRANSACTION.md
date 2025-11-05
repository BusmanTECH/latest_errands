# Driver Transaction Implementation Guide

## Overview

This document provides comprehensive documentation for implementing and working with driver transactions in the Errands platform. The transaction system supports both user and driver transactions, with dedicated endpoints and services for managing driver-related financial transactions.

## Table of Contents

1. [Entity Structure](#entity-structure)
2. [Transaction Types & Status](#transaction-types--status)
3. [DTOs](#dtos)
4. [Service Methods](#service-methods)
5. [API Endpoints](#api-endpoints)
6. [Implementation Examples](#implementation-examples)
7. [Use Cases](#use-cases)
8. [Error Handling](#error-handling)

---

## Entity Structure

### Transaction Entity

The `Transaction` entity is located at `src/transaction/entities/transaction.entity.ts`

```typescript
@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  user?: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'driverId' })
  driver?: User;

  @Column({ type: 'varchar', nullable: true })
  orderId?: string;

  @Column({ type: 'text', nullable: true })
  narration?: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
    default: TransactionType.CREDIT,
  })
  type: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.INITIATED,
  })
  status: TransactionStatus;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: false,
  })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN', nullable: false })
  currency: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  reference?: string;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Key Relationships

- **User Relationship**: Optional `user` field for regular user transactions
- **Driver Relationship**: Optional `driver` field (mapped via `driverId`) for driver transactions
- **Order Relationship**: Optional `orderId` to link transactions to specific orders

---

## Transaction Types & Status

### TransactionType Enum

```typescript
export enum TransactionType {
  CREDIT = 'credit',  // Money added to account
  DEBIT = 'debit',    // Money deducted from account
}
```

### TransactionStatus Enum

```typescript
export enum TransactionStatus {
  INITIATED = 'INITIATED',    // Transaction created but not completed
  SUCCESSFUL = 'SUCCESSFUL',  // Transaction completed successfully
  FAILED = 'FAILED',          // Transaction failed
  CANCELLED = 'CANCELLED',    // Transaction was cancelled
}
```

---

## DTOs

### CreateTransactionDto

Located at `src/transaction/dto/create-transaction.dto.ts`

```typescript
export class CreateTransactionDto {
  @IsUUID()
  @IsOptional()
  userId?: string;           // For user transactions

  @IsUUID()
  @IsOptional()
  driverId?: string;          // For driver transactions

  @IsString()
  @IsOptional()
  orderId?: string;           // Related order ID

  @IsString()
  @IsOptional()
  narration?: string;          // Transaction description

  @IsEnum(TransactionType)
  type: TransactionType;       // Required: 'credit' or 'debit'

  @IsEnum(TransactionStatus)
  @IsOptional()
  status?: TransactionStatus; // Optional, defaults to INITIATED

  @IsNumber()
  @Min(0.01)
  amount: number;             // Required: Transaction amount

  @IsString()
  @IsOptional()
  currency?: string;           // Optional, defaults to 'NGN'

  @IsString()
  @IsOptional()
  reference?: string;          // Optional, auto-generated if not provided
}
```

**Validation Rules:**
- Either `userId` OR `driverId` must be provided (not both required, but at least one)
- `amount` must be greater than 0.01
- `type` is required
- `reference` is auto-generated if not provided (format: `TXN-{timestamp}-{random}`)

---

## Service Methods

### TransactionService

Located at `src/transaction/transaction.service.ts`

#### 1. `createTransaction(dto: CreateTransactionDto): Promise<Transaction>`

Creates a new transaction for a user or driver.

**Features:**
- Validates that either `userId` or `driverId` is provided
- Auto-generates unique reference if not provided
- Handles duplicate reference generation
- Sets user or driver relationship
- Returns transaction with relations loaded

**Example:**
```typescript
const transaction = await transactionService.createTransaction({
  driverId: 'driver-uuid',
  type: TransactionType.CREDIT,
  amount: 5000.00,
  narration: 'Earnings from order #12345',
  currency: 'NGN',
});
```

#### 2. `getTransactions(userId?: string, filters?: {...}): Promise<{...}>`

Retrieves transactions for a user or driver with pagination and filtering.

**Parameters:**
- `userId`: User/Driver ID to filter transactions
- `filters`: Optional filters object
  - `type?: TransactionType`
  - `status?: TransactionStatus`
  - `page?: number`
  - `pageSize?: number`

**Returns:**
```typescript
{
  transactions: Transaction[];
  total: number;
  page: number;
  totalPages: number;
}
```

**Query Logic:**
- Searches transactions where `user.id = userId OR driver.id = userId OR transaction.driverId = userId`
- Supports both user and driver transactions in single query

#### 3. `getTransactionById(id: string): Promise<Transaction>`

Retrieves a single transaction by ID with relations.

#### 4. `getSerializedTransactionById(id: string): Promise<any>`

Returns a serialized transaction (safe for JSON responses) by ID.

#### 5. `getTransactionByReference(reference: string): Promise<Transaction | null>`

Finds a transaction by its unique reference.

#### 6. `updateTransactionStatus(id: string, status: TransactionStatus, isVerified?: boolean): Promise<Transaction>`

Updates transaction status and verification status.

#### 7. `updateTransactionByReference(reference: string, status: TransactionStatus, isVerified?: boolean): Promise<Transaction>`

Updates transaction status by reference instead of ID.

#### 8. `serializeTransaction(transaction: Transaction): any`

Serializes transaction to remove circular references. Returns:
- Transaction fields
- User object (if exists) with limited fields: `id`, `firstName`, `lastName`, `email`, `phoneNumber`, `role`
- Driver object (if exists) with same limited fields

---

## API Endpoints

### Base Path: `/transaction`

All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

### 1. Create Transaction

**Endpoint:** `POST /transaction`

**Description:** Creates a new transaction. Automatically sets `userId` or `driverId` based on authenticated user's role.

**Request Body:**
```json
{
  "driverId": "uuid-optional-if-rider-role",
  "type": "credit",
  "amount": 5000.00,
  "narration": "Earnings from order completion",
  "currency": "NGN",
  "orderId": "order-uuid-optional",
  "status": "INITIATED"
}
```

**Auto-Assignment Logic:**
- If user role is `rider` or `RIDER` → automatically sets `driverId` from token
- Otherwise → automatically sets `userId` from token
- Manual `driverId`/`userId` override still works if provided

**Response (201 Created):**
```json
{
  "status": 201,
  "message": "Transaction created successfully",
  "data": {
    "id": "transaction-uuid",
    "type": "credit",
    "status": "INITIATED",
    "amount": 5000.00,
    "currency": "NGN",
    "narration": "Earnings from order completion",
    "orderId": "order-uuid",
    "reference": "TXN-1234567890-ABC123",
    "isVerified": false,
    "verifiedAt": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "user": null,
    "driver": {
      "id": "driver-uuid",
      "firstName": "John",
      "lastName": "Doe",
      "email": "driver@example.com",
      "phoneNumber": "+1234567890",
      "role": "RIDER"
    }
  }
}
```

### 2. Get Transactions (Authenticated User/Driver)

**Endpoint:** `GET /transaction`

**Description:** Retrieves transactions for the authenticated user or driver.

**Query Parameters:**
- `type` (optional): Filter by transaction type (`credit` or `debit`)
- `status` (optional): Filter by status (`INITIATED`, `SUCCESSFUL`, `FAILED`, `CANCELLED`)
- `page` (optional): Page number (default: 1)
- `pageSize` (optional): Items per page (default: 20)

**Example:**
```
GET /transaction?type=credit&status=SUCCESSFUL&page=1&pageSize=10
```

**Response (200 OK):**
```json
{
  "status": 200,
  "message": "Transactions fetched successfully for rider",
  "data": {
    "transactions": [
      {
        "id": "transaction-uuid",
        "type": "credit",
        "status": "SUCCESSFUL",
        "amount": 5000.00,
        "currency": "NGN",
        "narration": "Earnings from order completion",
        "orderId": "order-uuid",
        "reference": "TXN-1234567890-ABC123",
        "isVerified": true,
        "verifiedAt": "2024-01-01T00:00:00.000Z",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z",
        "user": null,
        "driver": { ... }
      }
    ],
    "total": 50,
    "page": 1,
    "totalPages": 5
  }
}
```

### 3. Get Transaction by ID

**Endpoint:** `GET /transaction/:id`

**Description:** Retrieves a specific transaction by its ID.

**Response (200 OK):**
```json
{
  "status": 200,
  "message": "Transaction fetched successfully",
  "data": {
    "id": "transaction-uuid",
    "type": "credit",
    "status": "SUCCESSFUL",
    "amount": 5000.00,
    ...
  }
}
```

### 4. Get All Transactions (Admin Only)

**Endpoint:** `GET /transaction/admin/all`

**Description:** Retrieves all transactions in the system (admin access only).

**Guards:** `AuthGuard('jwt')` + `AdminGuard`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `type` (optional): Filter by type
- `status` (optional): Filter by status
- `search` (optional): Search in type, reference, status, or narration

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Transactions fetch successfully",
  "data": {
    "data": [ /* transactions array */ ],
    "total": 1000,
    "page": 1,
    "totalPages": 50
  }
}
```

---

## Implementation Examples

### Example 1: Create Driver Credit Transaction (Earnings)

```typescript
// In your service or controller
const transaction = await transactionService.createTransaction({
  driverId: driver.id,
  type: TransactionType.CREDIT,
  amount: order.totalAmount * 0.8, // 80% commission for driver
  narration: `Earnings from order ${order.id}`,
  orderId: order.id,
  currency: 'NGN',
  status: TransactionStatus.SUCCESSFUL,
});
```

### Example 2: Create Driver Debit Transaction (Withdrawal)

```typescript
const withdrawal = await transactionService.createTransaction({
  driverId: driver.id,
  type: TransactionType.DEBIT,
  amount: withdrawalAmount,
  narration: 'Bank account withdrawal',
  currency: 'NGN',
  status: TransactionStatus.INITIATED,
});
```

### Example 3: Get Driver Transaction History

```typescript
// Get all credit transactions for driver
const earnings = await transactionService.getTransactions(driverId, {
  type: TransactionType.CREDIT,
  status: TransactionStatus.SUCCESSFUL,
  page: 1,
  pageSize: 20,
});

// Calculate total earnings
const totalEarnings = earnings.transactions.reduce(
  (sum, txn) => sum + Number(txn.amount),
  0
);
```

### Example 4: Update Transaction Status After Payment Verification

```typescript
// After verifying payment with payment gateway
const transaction = await transactionService.updateTransactionStatus(
  transactionId,
  TransactionStatus.SUCCESSFUL,
  true // isVerified
);
```

### Example 5: Find Transaction by Reference

```typescript
// After payment callback
const transaction = await transactionService.getTransactionByReference(
  paymentReference
);

if (transaction) {
  await transactionService.updateTransactionStatus(
    transaction.id,
    TransactionStatus.SUCCESSFUL,
    true
  );
}
```

---

## Use Cases

### 1. Driver Earnings from Completed Orders

When an order is completed:
1. Create a CREDIT transaction for the driver
2. Set amount based on commission percentage
3. Link to order via `orderId`
4. Set status to `SUCCESSFUL` after verification

### 2. Driver Withdrawals

When driver requests withdrawal:
1. Create a DEBIT transaction
2. Set status to `INITIATED`
3. After payment gateway confirmation → update to `SUCCESSFUL`
4. Mark as verified

### 3. Driver Bonus/Promotion Credits

When admin grants bonus:
1. Create CREDIT transaction with narration explaining bonus
2. Set status to `SUCCESSFUL` immediately
3. Mark as verified

### 4. Transaction Reversal (Failed Orders)

When order is cancelled:
1. Find original CREDIT transaction
2. Create corresponding DEBIT transaction to reverse
3. Link both via `orderId`

### 5. Monthly Earnings Report

```typescript
// Get all successful credit transactions for current month
const startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const endDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

const transactions = await transactionService.getTransactions(driverId, {
  type: TransactionType.CREDIT,
  status: TransactionStatus.SUCCESSFUL,
});

const monthlyEarnings = transactions.transactions
  .filter(txn => {
    const txnDate = new Date(txn.createdAt);
    return txnDate >= startDate && txnDate <= endDate;
  })
  .reduce((sum, txn) => sum + Number(txn.amount), 0);
```

---

## Error Handling

### Common Errors

1. **Missing userId/driverId:**
   ```json
   {
     "status": 400,
     "message": "Either userId or driverId must be provided"
   }
   ```

2. **User/Driver Not Found:**
   ```json
   {
     "status": 404,
     "message": "Driver not found"
   }
   ```

3. **Invalid Amount:**
   ```json
   {
     "status": 400,
     "message": "Amount must be greater than 0"
   }
   ```

4. **Transaction Not Found:**
   ```json
   {
     "status": 404,
     "message": "Transaction not found"
   }
   ```

5. **Unauthorized Access:**
   ```json
   {
     "status": 401,
     "message": "Unauthorized"
   }
   ```

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

1. **Always provide narration:** Include clear descriptions for audit trails
2. **Link to orders:** Use `orderId` when transactions are order-related
3. **Verify transactions:** Set `isVerified` to true only after confirmation
4. **Use references:** Keep track of unique references for payment reconciliations
5. **Handle duplicates:** Reference generation includes duplicate checking
6. **Serialize responses:** Always use `serializeTransaction()` when returning data
7. **Pagination:** Use pagination for transaction lists to improve performance
8. **Filter appropriately:** Use type and status filters to reduce data load

---

## Database Considerations

- Transaction table: `transactions`
- Foreign keys: `userId` and `driverId` reference `users` table
- Reference field is unique for payment reconciliation
- Decimal precision: 12 digits, 2 decimal places (supports up to 9,999,999,999.99)
- Timestamps: Auto-managed `createdAt` and `updatedAt`

---

## Integration Points

### With Payment Service

The transaction system can integrate with payment gateways:
1. Create transaction with status `INITIATED`
2. Process payment via payment gateway
3. Update transaction status based on payment result
4. Mark as verified after successful payment

### With Order Service

Transactions can be linked to orders:
1. When order is completed → create driver credit transaction
2. When order is cancelled → create reversal transaction
3. Use `orderId` to track all transactions for an order

### With User/Driver Service

Transactions are linked to users/drivers:
- Fetch user/driver balance by summing all transactions
- Calculate earnings from credit transactions
- Track withdrawals via debit transactions

---

## Testing Examples

### Unit Test Example

```typescript
describe('TransactionService - Driver Transactions', () => {
  it('should create driver credit transaction', async () => {
    const dto: CreateTransactionDto = {
      driverId: 'driver-uuid',
      type: TransactionType.CREDIT,
      amount: 5000,
      narration: 'Test earnings',
    };

    const transaction = await transactionService.createTransaction(dto);

    expect(transaction.driver).toBeDefined();
    expect(transaction.type).toBe(TransactionType.CREDIT);
    expect(transaction.status).toBe(TransactionStatus.INITIATED);
    expect(transaction.reference).toBeDefined();
  });
});
```

### API Test Example

```bash
# Create driver transaction
curl -X POST http://localhost:3000/transaction \
  -H "Authorization: Bearer <driver-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "credit",
    "amount": 5000.00,
    "narration": "Earnings from order #12345"
  }'

# Get driver transactions
curl -X GET "http://localhost:3000/transaction?type=credit&status=SUCCESSFUL" \
  -H "Authorization: Bearer <driver-jwt-token>"
```

---

## Summary

The driver transaction system provides:

✅ Full CRUD operations for driver transactions  
✅ Automatic role-based user/driver assignment  
✅ Transaction filtering and pagination  
✅ Reference tracking for payment reconciliation  
✅ Status management and verification  
✅ Integration with orders and payments  
✅ Serialized responses for API safety  
✅ Admin access for all transactions  

This implementation supports all driver financial operations including earnings, withdrawals, bonuses, and transaction history tracking.

