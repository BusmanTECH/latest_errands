import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Card } from '../auth/entities/card.entity';
import { User } from '../auth/entities/user.entity';
import { PaystackService } from '../services/paystack.service';
import { PaymentService } from '../payment/payment.service';
import { TransactionService } from '../transaction/transaction.service';
import {
  PaymentTransactionType,
  PaymentTransactionStatus,
} from '../payment/entities/payment-transaction.entity';
import {
  TransactionType,
  TransactionStatus,
} from '../transaction/entities/transaction.entity';

@Injectable()
export class CardService {
  constructor(
    @InjectRepository(Card)
    private readonly cardRepo: Repository<Card>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly paystackService: PaystackService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
    private readonly transactionService: TransactionService,
  ) {}

  /**
   * Initialize card authorization with Paystack
   * User will be redirected to Paystack to authorize their card
   * Card name will be extracted from the card details after authorization
   */
  async initializeCardAuthorization(
    userId: string,
    email: string,
    amount: number = 50, // Small amount for authorization
  ): Promise<{ authorizationUrl: string; reference: string }> {
    try {
      const reference = `CARD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      // Get user to pass to transaction
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      try {
        // Create PaymentTransaction for payment tracking
        await this.paymentService.createTransaction({
          reference,
          user: user,
          type: PaymentTransactionType.DEBIT,
          amount,
          currency: 'NGN',
          status: PaymentTransactionStatus.INITIATED,
          narration: `Card authorization: New Card`,
        });

        // Create Transaction record for transaction history
        await this.transactionService.createTransaction({
          userId: userId,
          type: TransactionType.DEBIT,
          amount: amount,
          currency: 'NGN',
          narration: `Card authorization: New Card`,
          status: TransactionStatus.INITIATED,
          reference: reference,
        });
      } catch (transactionError) {
        console.error(
          '[CARD_SERVICE] Error creating transaction:',
          transactionError,
        );
        // Continue even if transaction creation fails, but log it
      }

      // Get frontend URL for callback
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const callbackUrl = `${process.env.BACKEND_URL || 'http://localhost:3001'}/card/callback`;

      const response = await this.paystackService.initializeTransaction({
        email,
        amount: amount, // Convert to kobo
        callback_url: callbackUrl,
        reference,
        metadata: {
          purpose: 'card_authorization',
          userId,
        },
      });

      if (!response.data?.authorization_url) {
        throw new BadRequestException(
          'Failed to initialize card authorization',
        );
      }

      return {
        authorizationUrl: response.data.authorization_url,
        reference: response.data.reference,
      };
    } catch (error) {
      console.error(
        '[CARD_SERVICE] Error initializing card authorization:',
        error,
      );
      throw error;
    }
  }

  /**
   * Save card after successful authorization
   * This should be called from the Paystack callback
   */
  async saveCard(
    userId: string,
    authorizationCode: string,
    reference: string,
    cardName?: string,
  ): Promise<Card> {
    try {
      const user = await this.userRepo.findOne({
        where: { id: userId },
        relations: ['card'],
      });

      if (!user) {
        console.error('[CARD_SERVICE] User not found:', userId);
        throw new NotFoundException('User not found');
      }

      const verification =
        await this.paystackService.verifyTransaction(reference);

      if (verification.data.status !== 'success') {
        console.error('[CARD_SERVICE] Transaction verification failed');
        throw new BadRequestException('Transaction verification failed');
      }

      const authorization = verification.data.authorization;
      if (!authorization) {
        console.error('[CARD_SERVICE] Authorization not found in transaction');
        throw new BadRequestException('Authorization not found in transaction');
      }

      // Extract card details from Paystack response
      const cardDetails = {
        authorization_code: authorizationCode,
        card_name: cardName || authorization.brand || 'Card',
        card_number: authorization.bin ? `****${authorization.last4}` : '****',
        card_date:
          authorization.exp_month && authorization.exp_year
            ? `${authorization.exp_month}/${authorization.exp_year}`
            : '',
        card_digit: authorization.last4 || '',
      };

      // Check if user already has a card
      if (user.card) {
        // Update existing card
        Object.assign(user.card, cardDetails);
        const updatedCard = await this.cardRepo.save(user.card);

        return updatedCard;
      } else {
        // Create new card
        const newCard = this.cardRepo.create({
          ...cardDetails,
        });
        const savedCard = await this.cardRepo.save(newCard);
        user.card = savedCard;
        await this.userRepo.save(user);
        return savedCard;
      }
    } catch (error) {
      console.error('[CARD_SERVICE] Exception in saveCard:', error);
      console.error('[CARD_SERVICE] Error message:', error.message);
      console.error('[CARD_SERVICE] Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Get user's saved card
   */
  async getUserCard(userId: string): Promise<Card | null> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['card'],
    });
    return user?.card || null;
  }

  /**
   * Get card by ID
   */
  async getCardById(cardId: string, userId: string): Promise<Card> {
    const card = await this.cardRepo.findOne({
      where: { id: cardId },
    });

    if (!card) {
      throw new NotFoundException('Card not found');
    }

    // Verify card belongs to user
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['card'],
    });

    if (user?.card?.id !== cardId) {
      throw new NotFoundException('Card not found');
    }

    return card;
  }

  /**
   * Delete user's card
   */
  async deleteCard(
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['card'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.card) {
      throw new NotFoundException('No card found to delete');
    }

    const cardId = user.card.id;
    user.card = null;
    await this.userRepo.save(user);
    await this.cardRepo.delete(cardId);

    return {
      success: true,
      message: 'Card deleted successfully',
    };
  }

  /**
   * Handle Paystack callback for card authorization
   * Automatically saves the card after successful authorization
   * Can accept webhook data directly or verify with Paystack using reference
   */
  async handleCardAuthorizationCallback(
    reference: string,
    webhookData?: {
      authorization?: any;
      metadata?: any;
      status?: string;
    },
  ): Promise<{
    success: boolean;
    authorizationCode?: string;
    message: string;
    card?: Card;
  }> {
    try {
      let authorization: any;
      let metadata: any;
      let status: string;

      // Use webhook data if provided (from webhook), otherwise verify with Paystack
      if (webhookData && webhookData.authorization) {
        authorization = webhookData.authorization;
        metadata = webhookData.metadata;
        status = webhookData.status || 'success';

        if (status !== 'success') {
          console.error(
            '[CARD_SERVICE] Transaction failed in webhook. Status:',
            status,
          );
          // Update transaction status to FAILED
          try {
            await this.transactionService.updateTransactionByReference(
              reference,
              TransactionStatus.FAILED,
              false,
            );
          } catch (transactionError) {
            console.error(
              '[CARD_SERVICE] Error updating transaction status to FAILED:',
              transactionError,
            );
          }
          throw new BadRequestException('Transaction verification failed');
        }
      } else {
        // Fallback: Verify the transaction with Paystack (for direct API calls)
        const verification =
          await this.paystackService.verifyTransaction(reference);

        if (verification.data.status !== 'success') {
          console.error(
            '[CARD_SERVICE] Transaction verification failed. Status:',
            verification.data.status,
          );
          // Update transaction status to FAILED
          try {
            await this.transactionService.updateTransactionByReference(
              reference,
              TransactionStatus.FAILED,
              false,
            );
          } catch (transactionError) {
            console.error(
              '[CARD_SERVICE] Error updating transaction status to FAILED:',
              transactionError,
            );
          }
          throw new BadRequestException('Transaction verification failed');
        }

        authorization = verification.data.authorization;
        metadata = verification.data.metadata;
        status = verification.data.status;
      }

      if (!authorization || !authorization.authorization_code) {
        console.error('[CARD_SERVICE] Authorization code not found');
        // Update transaction status to FAILED
        try {
          await this.transactionService.updateTransactionByReference(
            reference,
            TransactionStatus.FAILED,
            false,
          );
        } catch (transactionError) {
          console.error(
            '[CARD_SERVICE] Error updating transaction status to FAILED:',
            transactionError,
          );
        }
        throw new BadRequestException('Authorization code not found');
      }
      const userId = metadata?.userId;

      if (!userId) {
        console.error(
          '[CARD_SERVICE] User ID not found in transaction metadata',
        );
        // Update transaction status to FAILED
        try {
          await this.transactionService.updateTransactionByReference(
            reference,
            TransactionStatus.FAILED,
            false,
          );
        } catch (transactionError) {
          console.error(
            '[CARD_SERVICE] Error updating transaction status to FAILED:',
            transactionError,
          );
        }
        throw new BadRequestException(
          'User ID not found in transaction metadata',
        );
      }

      // Automatically save the card
      // Extract card name from the card being added (from Paystack authorization)
      try {
        // Get card name from authorization - use brand or card type
        const cardName = authorization.brand
          ? `${authorization.brand} ${authorization.card_type || ''}`.trim()
          : authorization.card_type || 'Card';

        const savedCard = await this.saveCard(
          userId,
          authorization.authorization_code,
          reference,
          cardName,
        );

        // Update transaction status to SUCCESSFUL after successful authorization
        try {
          await this.transactionService.updateTransactionByReference(
            reference,
            TransactionStatus.SUCCESSFUL,
            true,
          );
        } catch (transactionError) {
          console.error(
            '[CARD_SERVICE] Error updating transaction status:',
            transactionError,
          );
          // Don't fail the operation if transaction update fails
        }

        return {
          success: true,
          authorizationCode: authorization.authorization_code,
          message: 'Card saved successfully',
          card: savedCard,
        };
      } catch (error) {
        return {
          success: true,
          authorizationCode: authorization.authorization_code,
          message:
            'Card authorized but save failed. Please try saving manually.',
        };
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handle Paystack webhook for card authorization
   * This endpoint can be called by Paystack webhooks for more reliable processing
   */
  async handleWebhookEvent(
    eventData: any,
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Handle charge.success event for card authorization
      if (
        eventData.event === 'charge.success' ||
        eventData.event === 'transaction.success'
      ) {
        const transactionData = eventData.data;
        const reference = transactionData.reference;

        if (!reference) {
          return {
            success: false,
            message: 'Reference not found in webhook data',
          };
        }

        // Check if this is a card authorization (check metadata)
        const metadata = transactionData.metadata || {};
        if (metadata.purpose === 'card_authorization') {
          await this.handleCardAuthorizationCallback(reference);
          return {
            success: true,
            message: 'Card saved successfully via webhook',
          };
        }
      }

      return { success: true, message: 'Webhook processed' };
    } catch (error) {
      console.error('Error processing webhook:', error);
      return {
        success: false,
        message: error.message || 'Webhook processing failed',
      };
    }
  }
}
