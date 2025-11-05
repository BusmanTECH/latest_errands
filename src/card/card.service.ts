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

  
  async initializeCardAuthorization(
    userId: string,
    email: string,
    amount: number = 50, 
  ): Promise<{ authorizationUrl: string; reference: string }> {
    try {
      const reference = `CARD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      try {
        
        await this.paymentService.createTransaction({
          reference,
          user: user,
          type: PaymentTransactionType.DEBIT,
          amount,
          currency: 'NGN',
          status: PaymentTransactionStatus.INITIATED,
          narration: `Card authorization: New Card`,
        });

        
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
        
      }

      
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const callbackUrl = `${process.env.BACKEND_URL || 'http://localhost:3001'}/card/callback`;

      const response = await this.paystackService.initializeTransaction({
        email,
        amount: amount, 
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

      
      if (user.card) {
        
        Object.assign(user.card, cardDetails);
        const updatedCard = await this.cardRepo.save(user.card);

        return updatedCard;
      } else {
        
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

  
  async getUserCard(userId: string): Promise<Card | null> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['card'],
    });
    return user?.card || null;
  }

  
  async getCardById(cardId: string, userId: string): Promise<Card> {
    const card = await this.cardRepo.findOne({
      where: { id: cardId },
    });

    if (!card) {
      throw new NotFoundException('Card not found');
    }

    
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['card'],
    });

    if (user?.card?.id !== cardId) {
      throw new NotFoundException('Card not found');
    }

    return card;
  }

  
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

      
      if (webhookData && webhookData.authorization) {
        authorization = webhookData.authorization;
        metadata = webhookData.metadata;
        status = webhookData.status || 'success';

        if (status !== 'success') {
          console.error(
            '[CARD_SERVICE] Transaction failed in webhook. Status:',
            status,
          );
          
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
        
        const verification =
          await this.paystackService.verifyTransaction(reference);

        if (verification.data.status !== 'success') {
          console.error(
            '[CARD_SERVICE] Transaction verification failed. Status:',
            verification.data.status,
          );
          
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

      
      
      try {
        
        const cardName = authorization.brand
          ? `${authorization.brand} ${authorization.card_type || ''}`.trim()
          : authorization.card_type || 'Card';

        const savedCard = await this.saveCard(
          userId,
          authorization.authorization_code,
          reference,
          cardName,
        );

        
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

  
  async handleWebhookEvent(
    eventData: any,
  ): Promise<{ success: boolean; message: string }> {
    try {
      
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
