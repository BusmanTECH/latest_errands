# Card Addition Implementation Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture & Flow](#architecture--flow)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Service Implementation](#service-implementation)
6. [Paystack Integration](#paystack-integration)
7. [Callback & Webhook Handling](#callback--webhook-handling)
8. [Error Handling](#error-handling)
9. [Environment Variables](#environment-variables)
10. [Code Examples](#code-examples)

---

## Overview

The card addition feature allows users to securely add payment cards to their accounts using Paystack's payment gateway. The implementation follows a secure authorization flow where cards are automatically saved after successful authorization via Paystack.

### Key Features
- Secure card authorization through Paystack
- Automatic card saving after authorization
- Support for both callback and webhook processing
- Transaction tracking for card authorization
- User-friendly callback page with success/failure feedback
- Card management (view, delete)

---

## Architecture & Flow

### Card Addition Flow

```
1. User Request → POST /card/add
   ↓
2. CardService.initializeCardAuthorization()
   - Validates user
   - Creates transaction records
   - Initializes Paystack transaction
   ↓
3. Returns authorization URL
   ↓
4. User redirected to Paystack payment page
   ↓
5. User authorizes card on Paystack
   ↓
6. Paystack redirects to callback URL
   ↓
7. CardService.handleCardAuthorizationCallback()
   - Verifies transaction
   - Extracts authorization code
   - Saves card to database
   - Updates transaction status
   ↓
8. Redirects to success/failure page
```

### Alternative Flow (Webhook)

```
1. Paystack sends webhook event
   ↓
2. POST /card/webhook or POST /payment/webhook
   ↓
3. CardService.handleWebhookEvent()
   ↓
4. CardService.handleCardAuthorizationCallback()
   ↓
5. Card automatically saved
```

---

## Database Schema

### Card Entity

**File:** `src/auth/entities/card.entity.ts`

```typescript
@Entity()
export class Card {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({nullable: true, length: 190, type: 'varchar'})
  card_name?: string;

  @Column({ type: 'varchar', length: 190, nullable: false })
  card_number: string;

  @Column({ type: 'varchar', length: 190, nullable: false })
  card_date: string;

  @Column({ type: 'varchar', length: 190, nullable: false })
  card_digit: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  authorization_code?: string;
}
```

### User-Card Relationship

- One-to-One relationship: One user can have one card
- Card is stored in the `User` entity via relation

---

## API Endpoints

### 1. Add Card (Initialize Authorization)

**Endpoint:** `POST /card/add`

**Authentication:** Required (JWT Bearer Token)

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Card authorization initialized. Redirect user to authorization URL. Card will be saved automatically after successful authorization.",
  "data": {
    "authorizationUrl": "https://checkout.paystack.com/...",
    "reference": "CARD-1234567890-ABC123"
  }
}
```

**Implementation:** `CardController.addCard()`

---

### 2. Save Card (Manual Save)

**Endpoint:** `POST /card/save`

**Authentication:** Required (JWT Bearer Token)

**Request Body:**
```json
{
  "authorizationCode": "AUTH_xxxxx",
  "reference": "CARD-1234567890-ABC123",
  "cardName": "My Card" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Card saved successfully",
  "data": {
    "id": "card-uuid",
    "cardName": "Visa",
    "cardNumber": "****1234",
    "cardDigit": "1234"
  }
}
```

**Implementation:** `CardController.saveCard()`

---

### 3. Get User Card

**Endpoint:** `GET /card`

**Authentication:** Required (JWT Bearer Token)

**Response:**
```json
{
  "success": true,
  "message": "Card retrieved successfully",
  "data": {
    "id": "card-uuid",
    "cardName": "Visa",
    "cardNumber": "****1234",
    "cardDigit": "1234",
    "cardDate": "12/25"
  }
}
```

**Implementation:** `CardController.getUserCard()`

---

### 4. Delete Card

**Endpoint:** `DELETE /card`

**Authentication:** Required (JWT Bearer Token)

**Response:**
```json
{
  "success": true,
  "message": "Card deleted successfully"
}
```

**Implementation:** `CardController.deleteCard()`

---

### 5. Callback Handler

**Endpoint:** `GET /card/callback`

**Authentication:** Not Required (Public endpoint)

**Query Parameters:**
- `reference`: Transaction reference
- `trxref`: Alternative transaction reference

**Behavior:**
- Verifies transaction with Paystack
- Automatically saves card
- Redirects to success/failure page

**Implementation:** `CardController.handleCallback()`

---

### 6. Webhook Handler

**Endpoint:** `POST /card/webhook`

**Authentication:** Not Required (Public endpoint, should verify Paystack signature)

**Request Body:** Paystack webhook event data

**Behavior:**
- Processes `charge.success` or `transaction.success` events
- Automatically saves card if `metadata.purpose === 'card_authorization'`

**Implementation:** `CardController.handleWebhook()`

---

## Service Implementation

### CardService Methods

#### 1. `initializeCardAuthorization()`

**Location:** `src/card/card.service.ts`

**Purpose:** Initialize card authorization with Paystack

**Parameters:**
- `userId: string` - User ID
- `email: string` - User email
- `amount: number = 50` - Authorization amount (default 50 NGN)

**Process:**
1. Generates unique transaction reference: `CARD-{timestamp}-{random}`
2. Validates user exists
3. Creates payment transaction record (INITIATED status)
4. Creates transaction record (INITIATED status)
5. Initializes Paystack transaction with:
   - Email
   - Amount (converted to kobo)
   - Callback URL: `${BACKEND_URL}/card/callback`
   - Metadata: `{ purpose: 'card_authorization', userId }`
6. Returns authorization URL and reference

**Returns:**
```typescript
{
  authorizationUrl: string;
  reference: string;
}
```

---

#### 2. `saveCard()`

**Location:** `src/card/card.service.ts`

**Purpose:** Save card details to database after authorization

**Parameters:**
- `userId: string` - User ID
- `authorizationCode: string` - Paystack authorization code
- `reference: string` - Transaction reference
- `cardName?: string` - Optional card name/nickname

**Process:**
1. Fetches user with card relation
2. Verifies transaction with Paystack
3. Extracts authorization details from Paystack response
4. Builds card details object:
   ```typescript
   {
     authorization_code: authorizationCode,
     card_name: cardName || authorization.brand || 'Card',
     card_number: authorization.bin ? `****${authorization.last4}` : '****',
     card_date: `${authorization.exp_month}/${authorization.exp_year}`,
     card_digit: authorization.last4 || ''
   }
   ```
5. Updates existing card or creates new card
6. Links card to user
7. Returns saved card

**Returns:** `Card` entity

---

#### 3. `handleCardAuthorizationCallback()`

**Location:** `src/card/card.service.ts`

**Purpose:** Handle callback from Paystack after card authorization

**Parameters:**
- `reference: string` - Transaction reference
- `webhookData?: { authorization?, metadata?, status? }` - Optional webhook data

**Process:**
1. If webhook data provided, uses it; otherwise verifies transaction with Paystack
2. Validates transaction status is 'success'
3. Extracts authorization code and user ID from metadata
4. Calls `saveCard()` to save the card
5. Updates transaction status to SUCCESSFUL
6. Returns success result with card details

**Returns:**
```typescript
{
  success: boolean;
  authorizationCode?: string;
  message: string;
  card?: Card;
}
```

---

#### 4. `handleWebhookEvent()`

**Location:** `src/card/card.service.ts`

**Purpose:** Process Paystack webhook events

**Parameters:**
- `eventData: any` - Paystack webhook event data

**Process:**
1. Checks if event is `charge.success` or `transaction.success`
2. Validates reference exists
3. Checks if `metadata.purpose === 'card_authorization'`
4. Calls `handleCardAuthorizationCallback()` if conditions met
5. Returns success/failure result

**Returns:**
```typescript
{
  success: boolean;
  message: string;
}
```

---

#### 5. `getUserCard()`

**Location:** `src/card/card.service.ts`

**Purpose:** Retrieve user's saved card

**Parameters:**
- `userId: string` - User ID

**Returns:** `Card | null`

---

#### 6. `deleteCard()`

**Location:** `src/card/card.service.ts`

**Purpose:** Delete user's card

**Parameters:**
- `userId: string` - User ID

**Process:**
1. Fetches user with card relation
2. Validates card exists
3. Removes card relation from user
4. Deletes card from database

**Returns:**
```typescript
{
  success: boolean;
  message: string;
}
```

---

## Paystack Integration

### PaystackService Methods Used

#### 1. `initializeTransaction()`

**Location:** `src/services/paystack.service.ts`

**Request:**
```typescript
{
  email: string;
  amount: number; // in kobo
  callback_url: string;
  reference: string;
  metadata: {
    purpose: 'card_authorization';
    userId: string;
  };
  channels: ['card'];
}
```

**Response:**
```typescript
{
  data: {
    authorization_url: string;
    reference: string;
  }
}
```

---

#### 2. `verifyTransaction()`

**Location:** `src/services/paystack.service.ts`

**Purpose:** Verify transaction status and get authorization details

**Request:** `reference: string`

**Response:**
```typescript
{
  data: {
    status: 'success' | 'failed';
    authorization: {
      authorization_code: string;
      bin: string;
      last4: string;
      exp_month: number;
      exp_year: number;
      brand: string;
      card_type: string;
    };
    metadata: {
      purpose: string;
      userId: string;
    };
  }
}
```

---

## Callback & Webhook Handling

### Callback Flow

1. **User completes authorization on Paystack**
2. **Paystack redirects to:** `${BACKEND_URL}/card/callback?reference=xxx`
3. **CardController.handleCallback()** processes the callback:
   - Extracts reference from query params
   - Calls `CardService.handleCardAuthorizationCallback()`
   - Redirects to success/failure page: `${BACKEND_URL}/general/callback?success=true&message=...&reference=xxx`

### Webhook Flow

1. **Paystack sends webhook event** to `/card/webhook` or `/payment/webhook`
2. **Event types processed:**
   - `charge.success`
   - `transaction.success`
3. **CardService.handleWebhookEvent()** processes:
   - Validates event type
   - Checks metadata purpose
   - Calls `handleCardAuthorizationCallback()`
   - Card is automatically saved

### Success/Failure Page

**Endpoint:** `GET /general/callback`

**Query Parameters:**
- `success`: 'true' | 'false'
- `message`: Display message
- `reference`: Transaction reference

**Features:**
- Beautiful HTML page with success/failure indicator
- Auto-closes window if opened in popup
- Displays transaction reference

---

## Error Handling

### Common Errors

1. **User Not Found**
   - Status: `404 NotFoundException`
   - Message: "User not found"

2. **Transaction Verification Failed**
   - Status: `400 BadRequestException`
   - Message: "Transaction verification failed"
   - Occurs when Paystack transaction status is not 'success'

3. **Authorization Not Found**
   - Status: `400 BadRequestException`
   - Message: "Authorization not found in transaction"
   - Occurs when Paystack response doesn't include authorization data

4. **User ID Not Found in Metadata**
   - Status: `400 BadRequestException`
   - Message: "User ID not found in transaction metadata"

5. **Failed to Initialize Authorization**
   - Status: `400 BadRequestException`
   - Message: "Failed to initialize card authorization"
   - Occurs when Paystack doesn't return authorization URL

### Transaction Status Updates

- **INITIATED:** When authorization is initialized
- **SUCCESSFUL:** When card is successfully saved
- **FAILED:** When transaction verification fails or authorization is missing

---

## Environment Variables

Required environment variables:

```env
# Backend URL (for callbacks)
BACKEND_URL=http://localhost:3001

# Frontend URL (optional, for redirects)
FRONTEND_URL=http://localhost:3000

# Paystack Configuration
PAYSTACK_SECRET_KEY=sk_test_xxxxx
PAYSTACK_PUBLIC_KEY=pk_test_xxxxx
```

---

## Code Examples

### Frontend Integration Example

```typescript
// Initialize card addition
async function addCard(email: string) {
  try {
    const response = await fetch('/card/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();
    
    if (data.success) {
      // Redirect user to Paystack authorization page
      window.location.href = data.data.authorizationUrl;
      // Or open in popup:
      // window.open(data.data.authorizationUrl, 'paystack', 'width=600,height=700');
    }
  } catch (error) {
    console.error('Failed to initialize card:', error);
  }
}

// Get user's card
async function getUserCard() {
  try {
    const response = await fetch('/card', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Failed to get card:', error);
  }
}

// Delete card
async function deleteCard() {
  try {
    const response = await fetch('/card', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to delete card:', error);
  }
}
```

### Manual Card Save (Alternative Flow)

```typescript
// If you need to manually save card after getting authorization code
async function saveCard(authorizationCode: string, reference: string, cardName?: string) {
  try {
    const response = await fetch('/card/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        authorizationCode,
        reference,
        cardName
      })
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to save card:', error);
  }
}
```

---

## Module Dependencies

### CardModule Imports

**File:** `src/card/card.module.ts`

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Card, User]),
    ServicesModule,        // For PaystackService
    AuthModule,           // For User entity
    PaymentModule,        // For PaymentService (forwardRef)
    TransactionModule,    // For TransactionService
  ],
  controllers: [CardController],
  providers: [CardService],
  exports: [CardService], // Exported for use in PaymentModule
})
export class CardModule {}
```

### Dependencies

- **PaystackService:** Handles Paystack API calls
- **PaymentService:** Creates payment transaction records
- **TransactionService:** Creates and updates transaction records
- **User Repository:** Manages user-card relationship
- **Card Repository:** Manages card CRUD operations

---

## Transaction Tracking

### Payment Transaction

Created in `PaymentService.createTransaction()`:
- Type: `PaymentTransactionType.DEBIT`
- Status: `PaymentTransactionStatus.INITIATED`
- Amount: 50 NGN (authorization amount)
- Narration: "Card authorization: New Card"

### Transaction Record

Created in `TransactionService.createTransaction()`:
- Type: `TransactionType.DEBIT`
- Status: `TransactionStatus.INITIATED`
- Amount: 50 NGN
- Reference: Generated card reference
- Narration: "Card authorization: New Card"

### Status Updates

- Updated to `SUCCESSFUL` when card is successfully saved
- Updated to `FAILED` if verification fails or authorization is missing

---

## Security Considerations

1. **JWT Authentication:** All card endpoints (except callbacks/webhooks) require authentication
2. **Transaction Verification:** All transactions are verified with Paystack before saving
3. **Authorization Code:** Stored securely in database for future charges
4. **Card Data:** Only masked card numbers stored (last 4 digits)
5. **Webhook Verification:** Should verify Paystack signature (currently not implemented in card webhook)

---

## Testing

### Test Scenarios

1. **Successful Card Addition**
   - Initialize authorization
   - Complete Paystack flow
   - Verify card saved in database
   - Verify transaction status updated

2. **Failed Authorization**
   - Initialize authorization
   - Fail on Paystack
   - Verify transaction status is FAILED
   - Verify card not saved

3. **Webhook Processing**
   - Send webhook event
   - Verify card automatically saved
   - Verify transaction status updated

4. **Card Update**
   - Add new card when one exists
   - Verify existing card is updated

5. **Card Deletion**
   - Delete existing card
   - Verify card removed from database
   - Verify user-card relation removed

---

## File Structure

```
src/
├── card/
│   ├── card.controller.ts      # API endpoints
│   ├── card.service.ts          # Business logic
│   ├── card.module.ts           # Module definition
│   └── dto/
│       └── add-card.dto.ts      # DTOs for requests
├── auth/
│   └── entities/
│       └── card.entity.ts       # Card entity
├── services/
│   └── paystack.service.ts      # Paystack integration
├── payment/
│   └── payment.service.ts       # Payment transaction management
└── transaction/
    └── transaction.service.ts   # Transaction management
```

---

## Notes

1. **Authorization Amount:** Default is 50 NGN. This is a test charge to verify the card. In production, this amount may be refunded or adjusted.

2. **Automatic Saving:** Cards are automatically saved via callback/webhook. Manual save endpoint is available as fallback.

3. **One Card Per User:** The system supports one card per user. Adding a new card updates the existing one.

4. **Callback URL:** Must be publicly accessible for Paystack to redirect users after authorization.

5. **Webhook URL:** Should be configured in Paystack dashboard to receive events automatically.

---

## Future Enhancements

1. Add webhook signature verification for security
2. Support multiple cards per user
3. Add card expiration notifications
4. Implement card validation before saving
5. Add card usage statistics
6. Support card update without re-authorization

---

## Support

For issues or questions regarding card addition implementation, refer to:
- Paystack Documentation: https://paystack.com/docs
- NestJS Documentation: https://docs.nestjs.com
- TypeORM Documentation: https://typeorm.io
