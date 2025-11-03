import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Query,
  Headers,
  ForbiddenException,
  HttpStatus,
  Res,
  Req,
  Inject,
  forwardRef,
  UseFilters,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AuthGuard } from '@nestjs/passport';
import { ApiResponse, ApiTags, ApiOperation } from '@nestjs/swagger';

import { PaymentService } from './payment.service';
import { PaystackService } from '../services/paystack.service';
import { AdminGuard } from 'src/guards/admin.guard';
import { WalletService } from '../wallet/wallet.service';
import { TransactionService } from '../transaction/transaction.service';
import { PaymentTransactionStatus } from './entities/payment-transaction.entity';
import {
  TransactionType,
  TransactionStatus,
} from '../transaction/entities/transaction.entity';
import { OrderService } from '../order/order.service';
import { CardService } from '../card/card.service';
import { ExceptionsLoggerFilter } from 'src/common/exceptions/exceptionLogger.filter';

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private paystackService: PaystackService,
    private walletService: WalletService,
    private transactionService: TransactionService,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    @Inject(forwardRef(() => CardService))
    private readonly cardService: CardService,
  ) {}

  @Get('/paystack-callback')
  async paystackCallback(@Query() query: any) {
    const { reference, trxref } = query;
    const transactionReference = reference || trxref;

    if (!transactionReference) {
      throw new ForbiddenException({
        status: 'error',
        message: 'Transaction reference is required',
      });
    }

    try {
      // Check if transaction is already verified
      const existingTransaction =
        await this.paymentService.findTransactionByReference(
          transactionReference,
        );

      if (existingTransaction && existingTransaction.isVerified) {
        return {
          success: true,
          message: 'Payment already verified successfully',
          data: {
            reference: transactionReference,
            status: existingTransaction.status,
            amount: existingTransaction.amount,
          },
        };
      }

      // Verify the transaction with Paystack
      const verifyPayment =
        await this.paystackService.verifyTransaction(transactionReference);

      if (verifyPayment.data.status !== 'success') {
        throw new ForbiddenException({
          status: 'error',
          message: 'Payment Transaction Unsuccessful',
        });
      }

      // Update transaction status and mark as verified
      const updateTransaction = await this.paymentService.updateTransaction(
        {
          reference: transactionReference,
        },
        {
          status: PaymentTransactionStatus.SUCCESSFUL,
          isVerified: true,
          verifiedAt: new Date(),
        },
      );

      if (!updateTransaction) {
        throw new ForbiddenException({
          status: 'error',
          message: 'Payment Transaction Update Failed',
        });
      }

      // Handle different payment types based on metadata via webhook handler
      if (verifyPayment.data.metadata) {
        await this.handlePaymentConfirmation(
          verifyPayment.data,
          transactionReference,
        );
      }

      return {
        success: true,
        message: 'Payment verified successfully',
        data: {
          reference: transactionReference,
          status: 'SUCCESSFUL',
          amount: verifyPayment.data.amount / 100,
        },
      };
    } catch (error) {
      throw new ForbiddenException({
        status: 'error',
        message: error.message || 'Payment verification failed',
      });
    }
  }

  @Post('/webhook')
  async handleWebhook(
    @Req() req: any,
    @Headers('x-paystack-signature') signature: string,
  ) {
    // Get body from request - handle Buffer from express.raw middleware
    let body: any;
    let bodyString: string;

    if (Buffer.isBuffer(req.body)) {
      // Body is a Buffer from express.raw middleware, convert to string
      bodyString = req.body.toString('utf8');
      body = JSON.parse(bodyString);
    } else if (typeof req.body === 'string') {
      bodyString = req.body;
      body = JSON.parse(bodyString);
    } else {
      body = req.body;
      bodyString = JSON.stringify(body);
    }

    // Verify Paystack webhook signature - use the raw string
    const crypto = require('crypto');
    const secret = process.env.PAYSTACK_SECRET_KEY;
    const hash = crypto
      .createHmac('sha512', secret)
      .update(bodyString)
      .digest('hex');

    if (hash !== signature) {
      console.error('Invalid webhook signature');
      console.error('Expected hash (first 20):', hash?.substring(0, 20));
      console.error(
        'Received signature (first 20):',
        signature?.substring(0, 20),
      );
      throw new ForbiddenException({
        status: 'error',
        message: 'Invalid webhook signature',
      });
    }

    // Handle the webhook event
    const event = body.event;
    const data = body.data;
    if (event === 'charge.success') {
      // Check if transaction is already verified to prevent duplicate processing
      const existingTransaction =
        await this.paymentService.findTransactionByReference(data.reference);

      if (existingTransaction && existingTransaction.isVerified) {
        return {
          success: true,
          message:
            'Transaction already verified, skipping duplicate processing',
        };
      }

      // Verify the transaction with Paystack
      const verifyPayment = await this.paystackService.verifyTransaction(
        data.reference,
      );

      if (verifyPayment.data.status !== 'success') {
        throw new ForbiddenException({
          status: 'error',
          message: 'Payment Transaction Unsuccessful',
        });
      }

      const updateTransaction = await this.paymentService.updateTransaction(
        {
          reference: data.reference,
        },
        {
          status: PaymentTransactionStatus.SUCCESSFUL,
          isVerified: true,
          verifiedAt: new Date(),
        },
      );

      if (!updateTransaction) {
        throw new ForbiddenException({
          status: 'error',
          message: 'Payment Transaction Update Failed',
        });
      }

      if (data.metadata?.orderId) {
        // Handle order payments
        if (data.metadata.orderId) {
          await this.handleOrderPayment(
            333,
            data.metadata.orderId,
            data.reference,
          );
        }

        const amountInNaira = 3000 / 100;

        // Handle wallet funding payments
        if (data.metadata.walletFunding && data.metadata.userId) {
          try {
            await this.walletService.creditWallet(
              data.metadata.userId,
              amountInNaira,
              'Wallet funding via Paystack',
            );
          } catch (error) {
            console.error('Error funding wallet:', error);
          }
        }

        // Handle card authorization
        if (data.metadata.purpose === 'card_authorization') {
          try {
            // Pass webhook data directly to avoid re-verification
            await this.cardService.handleCardAuthorizationCallback(
              data.reference,
              {
                authorization: data.authorization,
                metadata: data.metadata,
                status: data.status,
              },
            );
          } catch (error) {
            console.error('Error processing card authorization:', error);
          }
        }
      }

      // Handle card authorization outside order payments
      if (data?.metadata?.purpose === 'card_authorization') {
        try {
          await this.cardService.handleCardAuthorizationCallback(
            data.reference,
            {
              authorization: data.authorization,
              metadata: data.metadata,
              status: data.status,
            },
          );
        } catch (error) {
          console.error('Error processing card authorization:', error);
        }
      }
    }

    return {
      success: true,
      message: 'Webhook processed successfully',
    };
  }

  private async handleOrderPayment(
    verifyPaymentData: any,
    orderId: string,
    reference: string,
  ): Promise<void> {
    // First, verify the order exists and payment amount matches
    const existingOrder = await this.orderService.findOne(orderId);

    if (!existingOrder) {
      return;
    }

    // Verify payment amount matches order amount (convert from kobo to naira)
    const paymentAmountInNaira = verifyPaymentData.amount / 100;
    if (Math.abs(paymentAmountInNaira - existingOrder.amount) > 0.01) {
      return;
    }

    if (verifyPaymentData.status === 'success') {
      const updatedOrder = await this.orderService.updateOrder(orderId, {
        paymentStatus: 'SUCCESSFUL',
        paymentMethod: 'card', // Ensure payment method is set to card
        paidAt: new Date(),
      });

      if (
        updatedOrder &&
        updatedOrder.driverId &&
        updatedOrder.paymentMethod !== 'cash'
      ) {
        try {
          // Credit the driver immediately
          await this.paymentService.creditRiderEarnings(
            updatedOrder.driverId.toString(),
            Number(updatedOrder.amount),
          );
        } catch (error) {
          console.error('Error crediting driver wallet ledger:', error);
        }
      }
    } else {
      // Payment was not successful, update order status
      await this.orderService.updateOrder(orderId, {
        paymentStatus: 'FAILED',
      });
    }
  }

  // ===================================ADMIN PAYMENT ENDPOINTS========================

  private async handlePaymentConfirmation(
    paymentData: any,
    reference: string,
  ): Promise<void> {
    const metadata = paymentData.metadata;
    const amountInNaira = paymentData.amount / 100;

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
        console.error('Error funding wallet:', error);
        // Don't throw - log the error but continue
        // The wallet has already been credited, so we don't want to fail the payment
        console.error('Transaction record creation failed:', error.message);
      }
    }

    if (metadata?.orderId && metadata?.userId) {
      try {
        // Create Transaction record for order payment with unique reference
        await this.transactionService.createTransaction({
          userId: metadata.userId,
          orderId: metadata.orderId,
          type: TransactionType.DEBIT,
          amount: amountInNaira,
          currency: 'NGN',
          narration: `Order successfully paid via card payment.`,
          status: TransactionStatus.SUCCESSFUL,
          reference: `TXN-${reference}`,
        });
      } catch (error) {
        console.error('Error processing order payment:', error);

        console.error('Transaction record creation failed:', error.message);
      }
    }
  }
}
