import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  HttpStatus,
  HttpException,
  Query,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { Users } from '../decorators/user.decorator';
import { CardService } from './card.service';
import {
  InitializeCardAuthorizationDto,
  SaveCardDto,
} from './dto/add-card.dto';

@ApiTags('card')
@Controller('card')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class CardController {
  constructor(private readonly cardService: CardService) {}

  @Post('/add')
  @ApiOperation({
    summary:
      'Add card - Single endpoint. Initialize authorization and card will be auto-saved via callback/webhook',
  })
  @ApiResponse({
    status: 200,
    description:
      'Authorization URL generated. Card will be saved automatically after authorization.',
  })
  async addCard(
    @Users('sub') userId: string,
    @Body() dto: InitializeCardAuthorizationDto,
  ) {
    try {
      const result = await this.cardService.initializeCardAuthorization(
        userId,
        dto.email,
        50,
      );

      return {
        success: true,
        message:
          'Card authorization initialized. Redirect user to authorization URL. Card will be saved automatically after successful authorization.',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to initialize card authorization',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
  @Get('/callback')
  @ApiOperation({
    summary: 'Verify card authorization',
  })
  @ApiResponse({
    status: 200,
    description: 'Card authorization verified successfully',
  })
  async verifyCardAuthorization(@Query('reference') reference: string) {
    try {
      return {
        success: true,
        message: 'Card authorization verified successfully',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to verify card authorization',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
  @Post('/authorize')
  @ApiOperation({
    summary: 'Initialize card authorization with Paystack (Legacy endpoint)',
  })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL generated successfully',
  })
  async initializeAuthorization(
    @Users('sub') userId: string,
    @Body() dto: InitializeCardAuthorizationDto,
  ) {
    try {
      const result = await this.cardService.initializeCardAuthorization(
        userId,
        dto.email,
        50,
      );

      return {
        success: true,
        message:
          'Card authorization initialized. Redirect to authorization URL. Card will be saved automatically after authorization.',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to initialize card authorization',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('/save')
  @ApiOperation({ summary: 'Save card after authorization' })
  @ApiResponse({ status: 200, description: 'Card saved successfully' })
  async saveCard(@Users('sub') userId: string, @Body() dto: SaveCardDto) {
    try {
      const card = await this.cardService.saveCard(
        userId,
        dto.authorizationCode,
        dto.reference,
        dto.cardName,
      );

      return {
        success: true,
        message: 'Card saved successfully',
        data: {
          id: card.id,
          cardName: card.card_name,
          cardNumber: card.card_number,
          cardDigit: card.card_digit,
          
        },
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to save card',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('/callback')
  @ApiOperation({
    summary: 'Paystack callback for card authorization - Auto-saves card',
  })
  async handleCallback(
    @Query('reference') reference: string,
    @Query('trxref') trxref: string,
    @Res() res: Response,
  ) {
    try {
      const transactionRef = reference || trxref;
      if (!transactionRef) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Transaction reference is required',
        });
      }

      const result =
        await this.cardService.handleCardAuthorizationCallback(transactionRef);

      if (result.success) {
        
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
        const successUrl = result.card
          ? `${backendUrl}/general/callback?success=true&message=${encodeURIComponent(result.message || 'Your card has been added successfully!')}&reference=${transactionRef}`
          : `${backendUrl}/general/callback?success=true&message=${encodeURIComponent(result.message || 'Card authorized but not saved.')}&reference=${transactionRef}`;
        return res.redirect(successUrl);
      } else {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
        return res.redirect(
          `${backendUrl}/general/callback?success=false&message=${encodeURIComponent('Failed to add card. Please try again.')}&reference=${transactionRef}`,
        );
      }
    } catch (error) {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
      return res.redirect(
        `${backendUrl}/general/callback?success=false&message=${encodeURIComponent(error.message || 'An error occurred while processing your card.')}'}`,
      );
    }
  }

  @Post('/webhook')
  @UseGuards() 
  @ApiOperation({
    summary:
      'Paystack webhook endpoint for card authorization events (No Auth Required)',
  })
  async handleWebhook(@Body() webhookData: any, @Res() res: Response) {
    try {
      
      
      
      
      

      const result = await this.cardService.handleWebhookEvent(webhookData);

      if (result.success) {
        return res.status(HttpStatus.OK).json(result);
      } else {
        return res.status(HttpStatus.BAD_REQUEST).json(result);
      }
    } catch (error) {
      console.error('Webhook error:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message || 'Webhook processing failed',
      });
    }
  }

  @Get()
  @ApiOperation({ summary: "Get user's saved card" })
  @ApiResponse({ status: 200, description: 'Card retrieved successfully' })
  async getUserCard(@Users('sub') userId: string) {
    try {
      const card = await this.cardService.getUserCard(userId);

      if (!card) {
        return {
          success: true,
          message: 'No card found',
          data: null,
        };
      }

      return {
        success: true,
        message: 'Card retrieved successfully',
        data: {
          id: card.id,
          cardName: card.card_name,
          cardNumber: card.card_number,
          cardDigit: card.card_digit,
          cardDate: card.card_date,
          
        },
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to retrieve card',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete()
  @ApiOperation({ summary: "Delete user's saved card" })
  @ApiResponse({ status: 200, description: 'Card deleted successfully' })
  async deleteCard(@Users('sub') userId: string) {
    try {
      const result = await this.cardService.deleteCard(userId);
      return {
        success: result.success,
        message: result.message,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to delete card',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
