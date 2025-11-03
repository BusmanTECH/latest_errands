/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Post,
  Body,
  HttpStatus,
  UseGuards,
  Res,
  ForbiddenException,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PaymentService } from '../payment/payment.service';
import { AuthGuard } from '@nestjs/passport';
import { Users } from 'src/decorators/user.decorator';
import { Response } from 'express';
import { FundWalletDto, WithdrawWalletDto } from './dto/fund-wallet.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '../auth/entities/user.entity';

@ApiTags('wallet')
@Controller('wallet')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly paymentService: PaymentService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get driver wallet information (drivers only)' })
  async getWallet(
    @Users('sub') userId: string,
    @Users('role') userRole: UserRole,
    @Res() res: Response,
  ) {
    try {
      if (userRole !== UserRole.RIDER) {
        throw new ForbiddenException('Wallet is only available for drivers');
      }
      const wallet = await this.walletService.getWallet(userId);
      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message: 'Wallet fetched successfully',
        data: {
          id: wallet.id,
          balance: Number(wallet.balance),
          currency: wallet.currency,
          createdAt: wallet.createdAt,
          updatedAt: wallet.updatedAt,
        },
      });
    } catch (error) {
      const status =
        error instanceof ForbiddenException
          ? HttpStatus.FORBIDDEN
          : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        status,
        message: error?.message || 'Failed to fetch wallet',
      });
    }
  }

  @Get('/balance')
  @ApiOperation({ summary: 'Get driver wallet balance (drivers only)' })
  async getBalance(
    @Users('sub') userId: string,
    @Users('role') userRole: UserRole,
    @Res() res: Response,
  ) {
    try {
      if (userRole !== UserRole.RIDER) {
        throw new ForbiddenException('Wallet is only available for drivers');
      }
      const balance = await this.walletService.getWalletBalance(userId);
      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message: 'Wallet balance fetched successfully',
        data: { balance },
      });
    } catch (error) {
      const status =
        error instanceof ForbiddenException
          ? HttpStatus.FORBIDDEN
          : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        status,
        message: error?.message || 'Failed to fetch wallet balance',
      });
    }
  }

  @Post('/fund')
  @ApiOperation({
    summary: 'Initialize wallet funding via Paystack (drivers only)',
  })
  async fundWallet(
    @Users('sub') userId: string,
    @Users('role') userRole: UserRole,
    @Body() dto: FundWalletDto,
    @Res() res: Response,
  ) {
    try {
      if (userRole !== UserRole.RIDER) {
        throw new ForbiddenException('Wallet is only available for drivers');
      }
      // Initialize Paystack payment for wallet funding
      const paymentInit = await this.paymentService.initializeWalletPayment(
        userId,
        dto.amount,
        dto.callbackUrl,
      );

      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message:
          'Payment initialized successfully. Redirect to authorization URL to complete payment.',
        data: {
          authorizationUrl: paymentInit.authorizationUrl,
          reference: paymentInit.reference,
          amount: dto.amount,
        },
      });
    } catch (error) {
      const status =
        error instanceof ForbiddenException
          ? HttpStatus.FORBIDDEN
          : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        status,
        message: error?.message || 'Failed to initialize wallet funding',
      });
    }
  }

  @Post('/withdraw')
  @ApiOperation({ summary: 'Withdraw from wallet (drivers only)' })
  async withdrawFromWallet(
    @Users('sub') userId: string,
    @Users('role') userRole: UserRole,
    @Body() dto: WithdrawWalletDto,
    @Res() res: Response,
  ) {
    try {
      if (userRole !== UserRole.RIDER) {
        throw new ForbiddenException('Wallet is only available for drivers');
      }
      const wallet = await this.walletService.debitWallet(
        userId,
        dto.amount,
        dto.narration || 'Wallet withdrawal',
      );
      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message: 'Withdrawal successful',
        data: {
          id: wallet.id,
          balance: Number(wallet.balance),
          currency: wallet.currency,
        },
      });
    } catch (error) {
      const status =
        error instanceof ForbiddenException
          ? HttpStatus.FORBIDDEN
          : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        status,
        message: error?.message || 'Failed to withdraw from wallet',
      });
    }
  }
}
