import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import {
  PaymentTransaction,
  PaymentTransactionStatus,
  PaymentTransactionType,
} from './entities/payment-transaction.entity';
import { User, UserRole } from '../auth/entities/user.entity';
import { Card } from '../auth/entities/card.entity';
import { PaystackService } from '../services/paystack.service';
import { PricingService } from '../pricing/pricing.service';
import { WalletService } from '../wallet/wallet.service';
import { TransactionService } from '../transaction/transaction.service';
import { DriverService } from '../driver/driver.service';
import { CardService } from '../card/card.service';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import {
  TransactionType,
  TransactionStatus,
} from '../transaction/entities/transaction.entity';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Card)
    private readonly cardRepo: Repository<Card>,
    private readonly paystackService: PaystackService,
    private readonly pricingService: PricingService,
    private readonly walletService: WalletService,
    private readonly transactionService: TransactionService,
    private readonly driverService: DriverService,
    @Inject(forwardRef(() => CardService))
    private readonly cardService: CardService,
  ) {}

  async createTransaction(
    payload: Partial<PaymentTransaction>,
  ): Promise<PaymentTransaction> {
    // Generate reference if not provided
    let reference = payload.reference;
    if (!reference) {
      reference = `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    }

    // Ensure reference is unique - retry up to 5 times
    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
      const existing = await this.transactionRepo.findOne({
        where: { reference },
      });

      if (!existing) {
        break; // Reference is unique, proceed
      }

      // Reference exists, generate a new one
      reference = `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}-${attempts}`;
      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new BadRequestException(
        'Failed to generate unique transaction reference after multiple attempts',
      );
    }

    const transaction = this.transactionRepo.create({
      ...payload,
      reference,
    });

    // Set user or driver relationship if IDs provided
    if (payload.user) {
      const user = await this.userRepo.findOne({
        where: {
          id: typeof payload.user === 'string' ? payload.user : payload.user.id,
        },
      });
      if (user) transaction.user = user;
    }

    if (payload.driver) {
      const driver = await this.userRepo.findOne({
        where: {
          id:
            typeof payload.driver === 'string'
              ? payload.driver
              : payload.driver.id,
        },
      });
      if (driver) transaction.driver = driver;
    }

    try {
      return await this.transactionRepo.save(transaction);
    } catch (error) {
      // Handle database-level unique constraint violations
      if (
        error.message?.includes('duplicate key') ||
        error.message?.includes('unique constraint') ||
        error.code === '23505' // PostgreSQL unique violation error code
      ) {
        // Generate a new reference and retry once
        const newReference = `PAY-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}-RETRY`;
        transaction.reference = newReference;
        try {
          return await this.transactionRepo.save(transaction);
        } catch (retryError) {
          throw new BadRequestException(
            'Failed to create transaction due to reference conflict',
          );
        }
      }
      throw error;
    }
  }

  async getUserTransactions(
    params: any,
    userId?: string,
  ): Promise<{
    status: string;
    message: string;
    data: {
      pagination: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
      };
      transactions: PaymentTransaction[];
    };
  }> {
    const { page = 1, pageSize = 50, ...rest } = params;
    const skip = (Number(page) - 1) * Number(pageSize);

    const queryBuilder = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.user', 'user')
      .leftJoinAndSelect('transaction.driver', 'driver');

    if (userId) {
      queryBuilder.where(
        'transaction.userId = :userId OR transaction.driverId = :userId',
        { userId },
      );
    }

    // Apply filters from rest params
    if (rest.type) {
      queryBuilder.andWhere('transaction.type = :type', { type: rest.type });
    }
    if (rest.status) {
      queryBuilder.andWhere('transaction.status = :status', {
        status: rest.status,
      });
    }

    queryBuilder.orderBy('transaction.createdAt', 'DESC');
    queryBuilder.skip(skip).take(Number(pageSize));

    const [transactions, total] = await queryBuilder.getManyAndCount();

    return {
      status: 'success',
      message: 'transactions fetched',
      data: {
        pagination: {
          page: Number(page),
          pageSize: Number(pageSize),
          total,
          totalPages: Math.ceil(total / Number(pageSize)),
        },
        transactions,
      },
    };
  }

  async updateTransaction(
    query: Partial<PaymentTransaction>,
    payload: Partial<PaymentTransaction>,
  ): Promise<PaymentTransaction | null> {
    try {
      const transaction = await this.transactionRepo.findOne({ where: query });
      if (!transaction) {
        // For webhook processing, if transaction doesn't exist, create it
        // This handles cases like card authorization where we didn't pre-create the transaction
        try {
          const newTransaction = this.transactionRepo.create({
            reference: query.reference,
            type: payload.type || PaymentTransactionType.DEBIT,
            amount: payload.amount || 0,
            currency: payload.currency || 'NGN',
            status: payload.status || PaymentTransactionStatus.INITIATED,
            isVerified: payload.isVerified || false,
            verifiedAt: payload.verifiedAt,
          } as Partial<PaymentTransaction>);

          const saved = await this.transactionRepo.save(newTransaction);
          return saved;
        } catch (createError) {
          throw createError;
        }
      }

      Object.assign(transaction, payload);
      return this.transactionRepo.save(transaction);
    } catch (error) {
      throw new ForbiddenException({
        status: false,
        message: 'Unable to update Transaction',
      });
    }
  }

  async findTransactionByReference(
    reference: string,
  ): Promise<PaymentTransaction | null> {
    try {
      return this.transactionRepo.findOne({
        where: { reference },
        relations: ['user', 'driver'],
      });
    } catch (error) {
      throw new ForbiddenException({
        status: false,
        message: 'Unable to find Transaction',
      });
    }
  }

  async findTransactionByOrderId(
    orderId: string,
  ): Promise<PaymentTransaction | null> {
    try {
      return this.transactionRepo.findOne({
        where: { orderId },
        relations: ['user', 'driver'],
      });
    } catch (error) {
      throw new ForbiddenException({
        status: false,
        message: 'Unable to find Transaction',
      });
    }
  }

  async getAllTransactions(page: number, filters: any) {
    const limit = 20;
    const skip = (page - 1) * limit;

    // Clean up filters
    const sanitizedFilters: Record<string, any> = {};
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        sanitizedFilters[key] = value;
      }
    });

    const searchKeyword = sanitizedFilters.search;
    delete sanitizedFilters.search;

    const queryBuilder = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.user', 'user')
      .leftJoinAndSelect('transaction.driver', 'driver');

    // Apply filters
    if (sanitizedFilters.type) {
      queryBuilder.andWhere('transaction.type = :type', {
        type: sanitizedFilters.type,
      });
    }
    if (sanitizedFilters.status) {
      queryBuilder.andWhere('transaction.status = :status', {
        status: sanitizedFilters.status,
      });
    }

    // Search keyword
    if (searchKeyword) {
      queryBuilder.andWhere(
        '(transaction.type ILIKE :keyword OR transaction.reference ILIKE :keyword OR transaction.status ILIKE :keyword)',
        { keyword: `%${searchKeyword}%` },
      );
    }

    queryBuilder.orderBy('transaction.createdAt', 'DESC');
    queryBuilder.skip(skip).take(limit);

    const [transactions, total] = await queryBuilder.getManyAndCount();

    return {
      success: true,
      data: transactions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async initializeWalletPayment(
    userId: string,
    amount: number,
    callbackUrl?: string,
  ): Promise<{ authorizationUrl: string; reference: string }> {
    // Get user details
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate unique reference
    const reference = this.paystackService.generateReference('WALLET');

    // Initialize Paystack transaction
    const paystackResponse = await this.paystackService.initializeTransaction({
      email: user.email,
      amount: amount,
      reference: reference,
      callback_url:
        callbackUrl ||
        `${process.env.BASE_URL || ''}/payment/paystack-callback`,
      metadata: {
        walletFunding: true,
        userId: userId,
        purpose: 'wallet_funding',
      },
    });

    // Create PaymentTransaction record
    const paymentTransaction = await this.createTransaction({
      user: user,
      amount: amount,
      reference: reference,
      type: PaymentTransactionType.CREDIT,
      status: PaymentTransactionStatus.PENDING,
      narration: 'Wallet funding via Paystack',
      currency: 'NGN',
    });

    return {
      authorizationUrl: paystackResponse.data.authorization_url,
      reference: reference,
    };
  }

  async getPlatformPercentage(): Promise<number> {
    const settings = await this.pricingService.getCurrentSettings();
    if (!settings) {
      throw new BadRequestException('Pricing settings not configured');
    }
    return Number(settings.orderPercentage) || 10; // Default to 10% if not set
  }

  async getBalanceLimit(): Promise<number> {
    const settings = await this.pricingService.getCurrentSettings();
    if (!settings) {
      throw new BadRequestException('Pricing settings not configured');
    }
    return Number(settings.limitAmount) || -1000; // Default to -1000 if not set
  }

  async calculatePlatformFee(orderAmount: number): Promise<number> {
    const percentage = await this.getPlatformPercentage();
    return (orderAmount * percentage) / 100;
  }

  async deductPlatformFeeFromRider(
    riderId: string,
    feeAmount: number,
  ): Promise<void> {
    const limitAmount = await this.getBalanceLimit();

    // Deduct fee from wallet with negative balance allowance
    await this.walletService.debitWallet(
      riderId,
      feeAmount,
      'Platform fee deduction',
      true, // allowNegative
      limitAmount, // negativeLimit
    );
  }

  async creditRiderEarnings(riderId: string, amount: number): Promise<void> {
    await this.walletService.creditWallet(
      riderId,
      amount,
      'Order payment earnings',
    );
  }

  async processCardPayment(
    userId: string,
    orderAmount: number,
    orderId: string,
    riderId: string,
    cardId?: string,
  ): Promise<{ success: boolean; reference: string }> {
    // Get user
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['card'],
    });
    if (!user) throw new NotFoundException('User not found');

    // Check if card exists
    let card: Card | null = null;
    if (cardId) {
      card = await this.cardRepo.findOne({ where: { id: cardId } });
    } else {
      // Get user's attached card
      card = user.card || null;
    }

    if (!card) {
      throw new BadRequestException(
        'Card not attached. Please add a card to proceed.',
      );
    }

    // Check if card has authorization_code
    if (!card.authorization_code) {
      throw new BadRequestException(
        'Card authorization not available. Please re-add your card.',
      );
    }

    // Generate reference
    const reference = this.paystackService.generateReference('ORDER');

    try {
      // Charge card via Paystack using saved authorization_code
      const chargeResponse = await this.paystackService.chargeAuthorization({
        email: user.email,
        amount: orderAmount,
        authorization_code: card.authorization_code,
        reference: reference,
        metadata: {
          orderId: orderId,
          userId: userId,
          purpose: 'order_payment',
        },
      });

      if (chargeResponse.data?.status !== 'success') {
        throw new BadRequestException(
          chargeResponse.data?.gateway_response ||
            'Card charge failed. Please try again.',
        );
      }

      // Verify rider is a driver
      const rider = await this.userRepo.findOne({
        where: { id: riderId, role: UserRole.RIDER },
      });
      if (!rider) throw new NotFoundException('Rider not found');

      // Get platform fee
      const platformFee = await this.calculatePlatformFee(orderAmount);

      // Deduct platform fee from rider wallet
      await this.deductPlatformFeeFromRider(riderId, platformFee);

      // Credit full order amount to rider wallet (for card payments)
      await this.creditRiderEarnings(riderId, orderAmount);

      // Create PaymentTransaction
      await this.createTransaction({
        user: user,
        driver: rider,
        amount: orderAmount,
        reference: reference,
        orderId: orderId,
        type: PaymentTransactionType.DEBIT,
        status: PaymentTransactionStatus.SUCCESSFUL,
        narration: `Order payment for order ${orderId}`,
        currency: 'NGN',
        isVerified: true,
        verifiedAt: new Date(),
      });

      // Create Transaction record for rider earnings
      await this.transactionService.createTransaction({
        userId: riderId,
        orderId: orderId,
        type: TransactionType.CREDIT,
        amount: orderAmount,
        currency: 'NGN',
        narration: `Order payment earnings for order `,
        status: TransactionStatus.SUCCESSFUL,
        reference: `TXN-${reference}`,
      });

      // Create Transaction record for platform fee deduction
      await this.transactionService.createTransaction({
        userId: riderId,
        orderId: orderId,
        type: TransactionType.DEBIT,
        amount: platformFee,
        currency: 'NGN',
        narration: `Platform fee deduction for order`,
        status: TransactionStatus.SUCCESSFUL,
        reference: `TXN-FEE-${reference}`,
      });

      // Update driver stats
      await this.driverService.updateDriverStats(riderId, orderAmount);

      return { success: true, reference };
    } catch (error) {
      throw new BadRequestException(
        error.message || 'Failed to process card payment',
      );
    }
  }

  async chargeCardForOrder(
    userId: string,
    orderAmount: number,
    orderId: string,
  ): Promise<{ success: boolean; reference: string }> {
    // Get user with card relationship
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['card'],
    });
    if (!user) throw new NotFoundException('User not found');

    // Check if user has a saved card
    if (!user.card || !user.card.authorization_code) {
      throw new BadRequestException(
        'Please add a payment card before placing order',
      );
    }

    const card = user.card;

    // Generate reference (will be made unique by createTransaction if needed)
    let reference = this.paystackService.generateReference('ORDER');

    try {
      // Charge card via Paystack using saved authorization_code
      const chargeResponse = await this.paystackService.chargeAuthorization({
        email: user.email,
        amount: orderAmount,
        authorization_code: card.authorization_code,
        reference: reference,
        metadata: {
          orderId: orderId,
          userId: userId,
          purpose: 'order_payment',
        },
      });

      if (chargeResponse.data?.status !== 'success') {
        // Check for insufficient funds error
        const errorMessage =
          chargeResponse.data?.gateway_response || 'Card charge failed';
        if (
          errorMessage.toLowerCase().includes('insufficient') ||
          errorMessage.toLowerCase().includes('balance')
        ) {
          throw new BadRequestException(
            'Insufficient funds on card. Available balance is insufficient for this transaction',
          );
        }
        throw new BadRequestException(
          errorMessage || 'Card charge failed. Please try again.',
        );
      }

      // Check if PaymentTransaction already exists for this order (prevent duplicates)
      let paymentTransaction = await this.transactionRepo.findOne({
        where: {
          orderId: orderId,
          status: PaymentTransactionStatus.SUCCESSFUL,
        },
      });

      if (!paymentTransaction) {
        // Create PaymentTransaction record for order payment
        // createTransaction will handle reference uniqueness automatically
        try {
          paymentTransaction = await this.createTransaction({
            user: user,
            amount: orderAmount,
            reference: reference, // Will be made unique by createTransaction if needed
            orderId: orderId,
            type: PaymentTransactionType.DEBIT,
            status: PaymentTransactionStatus.SUCCESSFUL,
            narration: `Order payment for order ${orderId}`,
            currency: 'NGN',
            isVerified: true,
            verifiedAt: new Date(),
          });
        } catch (error) {
          // If duplicate key error or unique constraint, check if transaction already exists for this order
          if (
            error.message?.includes('duplicate key') ||
            error.message?.includes('unique constraint') ||
            error.code === '23505'
          ) {
            // Try to find existing transaction for this order
            paymentTransaction = await this.transactionRepo.findOne({
              where: { orderId: orderId },
            });
            if (!paymentTransaction) {
              // If still not found, it's a different issue - throw the error
              throw new BadRequestException(
                'Failed to create payment transaction. Please try again.',
              );
            }
            // Use the existing transaction's reference
            reference = paymentTransaction.reference;
          } else {
            throw error;
          }
        }
      } else {
        // Use existing transaction's reference
        reference = paymentTransaction.reference;
      }

      // Create Transaction record (check for existing first)
      const existingTxnRef = `TXN-${paymentTransaction.reference}`;
      const existingTxnByRef =
        await this.transactionService.getTransactionByReference(existingTxnRef);

      if (!existingTxnByRef) {
        try {
          await this.transactionService.createTransaction({
            userId: userId,
            orderId: orderId,
            type: TransactionType.DEBIT,
            amount: orderAmount,
            currency: 'NGN',
            narration: `Order payment for order ${orderId}`,
            status: TransactionStatus.SUCCESSFUL,
            reference: existingTxnRef,
          });
        } catch (error) {
          // If duplicate, continue - transaction might already exist
          if (
            !error.message?.includes('duplicate key') &&
            !error.message?.includes('unique constraint')
          ) {
            throw error;
          }
        }
      }

      return { success: true, reference };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        error.message || 'Failed to process card payment',
      );
    }
  }

  async processCashPayment(
    userId: string,
    orderAmount: number,
    orderId: string,
    riderId: string,
  ): Promise<{ success: boolean }> {
    // Verify rider is a driver
    const rider = await this.userRepo.findOne({
      where: { id: riderId, role: UserRole.RIDER },
    });
    if (!rider) throw new NotFoundException('Rider not found');

    // Get commission percentage from PricingService
    const pricingSettings = await this.pricingService.getCurrentSettings();
    if (!pricingSettings) {
      throw new BadRequestException('Pricing settings not configured');
    }

    const orderPercentage = Number(pricingSettings.orderPercentage) || 10;
    const commission = (orderAmount * orderPercentage) / 100;

    // Check rider wallet has sufficient balance for commission
    const walletBalance = await this.walletService.getWalletBalance(riderId);

    if (walletBalance < commission) {
      throw new BadRequestException(
        `Insufficient wallet balance. Required: ${commission.toFixed(2)} NGN for commission, Available: ${walletBalance.toFixed(2)} NGN`,
      );
    }

    // Deduct commission from rider wallet
    await this.deductPlatformFeeFromRider(riderId, commission);

    // Create PaymentTransaction for cash payment
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const reference = this.paystackService.generateReference('CASH');

    await this.createTransaction({
      user: user,
      driver: rider,
      amount: orderAmount,
      reference: reference,
      orderId: orderId,
      type: PaymentTransactionType.DEBIT,
      status: PaymentTransactionStatus.SUCCESSFUL,
      narration: `Cash payment for order ${orderId}`,
      currency: 'NGN',
      isVerified: true,
      verifiedAt: new Date(),
    });

    // Create Transaction record for commission deduction
    await this.transactionService.createTransaction({
      userId: riderId,
      orderId: orderId,
      type: TransactionType.DEBIT,
      amount: commission,
      currency: 'NGN',
      narration: `Platform commission deduction for order ${orderId}`,
      status: TransactionStatus.SUCCESSFUL,
      reference: `TXN-${reference}`,
    });

    // Update driver stats
    await this.driverService.updateDriverStats(riderId, orderAmount);

    return { success: true };
  }

  /**
   * Verify Paystack webhook signature
   */
  verifyPaystackSignature(body: any, signature: string): boolean {
    try {
      const crypto = require('crypto');
      const secret = process.env.PAYSTACK_SECRET_KEY;

      if (!secret) {
        this.logger.warn('PAYSTACK_SECRET_KEY not configured');
        return false;
      }

      if (!signature) {
        return false;
      }

      // Handle different body formats
      let bodyString: string;
      if (typeof body === 'string') {
        // Body is already a string
        bodyString = body;
      } else if (Buffer.isBuffer(body)) {
        // Body is a Buffer
        bodyString = body.toString('utf8');
      } else if (body != null) {
        // Body is an object, stringify it
        bodyString = JSON.stringify(body);
      } else {
        return false;
      }

      const hash = crypto
        .createHmac('sha512', secret)
        .update(bodyString)
        .digest('hex');

      const isValid = hash === signature;

      return isValid;
    } catch (error) {
      this.logger.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  /**
   * Main webhook handler that routes events to appropriate services
   */
  async handleWebhookEvent(
    eventData: any,
  ): Promise<{ success: boolean; message: string; processedBy?: string }> {
    try {
      const event = eventData.event;
      const data = eventData.data;

      if (!event || !data) {
        return { success: false, message: 'Invalid webhook data structure' };
      }

      this.logger.log(
        `Processing webhook event: ${event} for reference: ${data.reference}`,
      );

      // Extract metadata to determine the purpose
      const metadata = data.metadata || {};
      const purpose = metadata.purpose;

      // Route based on purpose or event type
      switch (purpose) {
        case 'card_authorization':
          return await this.handleCardAuthorizationWebhook(data);

        case 'order_payment':
          return await this.handleOrderPaymentWebhook(data, event);

        default:
          // If no purpose, check event type and handle accordingly
          if (event === 'charge.success' || event === 'transaction.success') {
            // Try to infer purpose from metadata or handle as general payment
            if (purpose) {
              this.logger.warn(
                `Unknown purpose: ${purpose}, handling as general payment`,
              );
            }
            return await this.handleGeneralPaymentWebhook(data, event);
          }

          return {
            success: true,
            message: `Event ${event} processed but no specific handler found`,
          };
      }
    } catch (error) {
      this.logger.error('Error processing webhook:', error);
      return {
        success: false,
        message: error.message || 'Webhook processing failed',
      };
    }
  }

  /**
   * Handle card authorization webhook
   */
  private async handleCardAuthorizationWebhook(
    data: any,
  ): Promise<{ success: boolean; message: string; processedBy: string }> {
    try {
      const reference = data.reference;

      if (!reference) {
        return {
          success: false,
          message: 'Reference not found in webhook data',
          processedBy: 'card-service',
        };
      }

      // Use card service to handle authorization callback
      const result =
        await this.cardService.handleCardAuthorizationCallback(reference);

      if (result.success && result.card) {
        return {
          success: true,
          message: 'Card saved successfully via webhook',
          processedBy: 'card-service',
        };
      }

      return {
        success: true,
        message: result.message || 'Card authorization processed',
        processedBy: 'card-service',
      };
    } catch (error) {
      this.logger.error('Error handling card authorization webhook:', error);
      return {
        success: false,
        message: error.message || 'Failed to process card authorization',
        processedBy: 'card-service',
      };
    }
  }

  /**
   * Handle order payment webhook
   */
  private async handleOrderPaymentWebhook(
    data: any,
    event: string,
  ): Promise<{ success: boolean; message: string; processedBy: string }> {
    try {
      const reference = data.reference;

      // Check if transaction is already verified to prevent duplicate processing
      const existingTransaction =
        await this.findTransactionByReference(reference);

      if (existingTransaction && existingTransaction.isVerified) {
        return {
          success: true,
          message:
            'Transaction already verified, skipping duplicate processing',
          processedBy: 'payment-service',
        };
      }

      // Verify the transaction with Paystack
      const verifyPayment =
        await this.paystackService.verifyTransaction(reference);

      if (verifyPayment.data.status !== 'success') {
        return {
          success: false,
          message: 'Payment Transaction Unsuccessful',
          processedBy: 'payment-service',
        };
      }

      // Update transaction status and mark as verified
      const updateTransaction = await this.updateTransaction(
        { reference },
        {
          status: PaymentTransactionStatus.SUCCESSFUL,
          isVerified: true,
          verifiedAt: new Date(),
        },
      );

      if (!updateTransaction) {
        return {
          success: false,
          message: 'Payment Transaction Update Failed',
          processedBy: 'payment-service',
        };
      }

      // Handle payment confirmation based on metadata
      if (verifyPayment.data.metadata) {
        await this.handlePaymentConfirmation(verifyPayment.data, reference);
        this.logger.log(`Order payment processed for reference: ${reference}`);
      }

      return {
        success: true,
        message: `Order payment webhook processed successfully for transaction ${reference}`,
        processedBy: 'payment-service',
      };
    } catch (error) {
      this.logger.error('Error handling order payment webhook:', error);
      return {
        success: false,
        message: error.message || 'Failed to process order payment',
        processedBy: 'payment-service',
      };
    }
  }

  /**
   * Handle general payment webhook (for payments without specific purpose)
   */
  private async handleGeneralPaymentWebhook(
    data: any,
    event: string,
  ): Promise<{ success: boolean; message: string; processedBy: string }> {
    try {
      const reference = data.reference;

      // Check if transaction exists
      const existingTransaction =
        await this.findTransactionByReference(reference);

      if (existingTransaction) {
        if (!existingTransaction.isVerified) {
          const verifyPayment =
            await this.paystackService.verifyTransaction(reference);

          if (verifyPayment.data.status === 'success') {
            await this.updateTransaction(
              { reference },
              {
                status: PaymentTransactionStatus.SUCCESSFUL,
                isVerified: true,
                verifiedAt: new Date(),
              },
            );

            // Handle payment confirmation for wallet funding and other purposes
            if (verifyPayment.data.metadata) {
              await this.handlePaymentConfirmation(
                verifyPayment.data,
                reference,
              );
            }
          }
        }

        return {
          success: true,
          message: 'General payment webhook processed successfully',
          processedBy: 'payment-service',
        };
      }

      // If no transaction found, just log it
      this.logger.log(
        `General payment webhook received for reference: ${reference} but no transaction found`,
      );

      return {
        success: true,
        message: 'Webhook processed but no transaction found to update',
        processedBy: 'payment-service',
      };
    } catch (error) {
      this.logger.error('Error handling general payment webhook:', error);
      return {
        success: false,
        message: error.message || 'Failed to process general payment',
        processedBy: 'payment-service',
      };
    }
  }

  /**
   * Handle payment confirmation - creates transactions for wallet funding and order payments
   */
  private async handlePaymentConfirmation(
    paymentData: any,
    reference: string,
  ): Promise<void> {
    console.log('[PAYMENT_SERVICE] handlePaymentConfirmation called');
    const metadata = paymentData.metadata;
    const amountInNaira = paymentData.amount / 100;

    // Handle wallet funding payments
    if (metadata?.walletFunding && metadata?.userId) {
      try {
        // Update wallet balance

        await this.walletService.creditWallet(
          metadata.userId,
          amountInNaira,
          'Wallet funding via Paystack',
        );

        await this.transactionService.createTransaction({
          userId: metadata.userId,
          type: TransactionType.CREDIT,
          amount: amountInNaira,
          currency: 'NGN',
          narration: 'Wallet funding via Paystack',
          status: TransactionStatus.SUCCESSFUL,
          reference: `TXN-${reference}`,
        });
      } catch (error) {
        // Don't throw - log the error but continue
        // The wallet has already been credited, so we don't want to fail the payment
        console.error(
          '[PAYMENT_SERVICE] Transaction record creation failed:',
          error.message,
        );
      }
    }

    // Handle order payments
    if (metadata?.orderId && metadata?.userId) {
      try {
        // Create Transaction record for order payment with unique reference

        await this.transactionService.createTransaction({
          userId: metadata.userId,
          orderId: metadata.orderId,
          type: TransactionType.DEBIT,
          amount: amountInNaira,
          currency: 'NGN',
          narration: `Order payment for order ${metadata.orderId}`,
          status: TransactionStatus.SUCCESSFUL,
          reference: `TXN-${reference}`,
        });
      } catch (error) {
        console.error(
          '[PAYMENT_SERVICE] Error processing order payment:',
          error,
        );
        console.error('[PAYMENT_SERVICE] Error stack:', error.stack);
        // Don't throw - log the error but continue
        // The payment has already been processed, so we don't want to fail
        console.error(
          '[PAYMENT_SERVICE] Transaction record creation failed:',
          error.message,
        );
      }
    }

    // Log if no specific purpose found
    if (!metadata?.walletFunding && !metadata?.orderId) {
      console.log(
        '[PAYMENT_SERVICE] No wallet funding or order payment metadata found',
      );
    }
  }
}
