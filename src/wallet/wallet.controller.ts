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
  NotFoundException,
  Query,
  Param,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PaymentService } from '../payment/payment.service';
import { NotificationService } from '../notification/notification.service';
import { MailService } from '../mail/mail.service';
import { AuthGuard } from '@nestjs/passport';
import { Users } from 'src/decorators/user.decorator';
import { Response } from 'express';
import { FundWalletDto, WithdrawWalletDto } from './dto/fund-wallet.dto';
import {
  CreateWithdrawalRequestDto,
  ApproveWithdrawalDto,
  RejectWithdrawalDto,
  GetWithdrawalsQueryDto,
} from './dto/withdrawal-request.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '../auth/entities/user.entity';
import { AdminGuard } from '../guards/admin.guard';

@ApiTags('wallet')
@Controller('wallet')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly paymentService: PaymentService,
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
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
  @ApiOperation({
    summary: 'Request withdrawal from wallet (drivers only)',
    description:
      'Creates a withdrawal request that needs admin approval. Funds are not debited until approved.',
  })
  async withdrawFromWallet(
    @Users('sub') userId: string,
    @Users('role') userRole: UserRole,
    @Body() dto: CreateWithdrawalRequestDto,
    @Res() res: Response,
  ) {
    try {
      if (userRole !== UserRole.RIDER) {
        throw new ForbiddenException('Wallet is only available for drivers');
      }
      const withdrawalRequest =
        await this.walletService.createWithdrawalRequest(
          userId,
          dto.amount,
          dto.narration,
        );

      // Send email and push notification
      try {
        const user = await this.walletService.getUserById(userId);
        if (user) {
          // Send email notification
          await this.mailService.sendWithdrawalRequestEmail(
            withdrawalRequest,
            user,
          );

          // Send push notification
          await this.notificationService.sendCustomNotification(
            userId,
            'Withdrawal Request Submitted',
            `Your withdrawal request of ${withdrawalRequest.amount} ${withdrawalRequest.currency} has been submitted and is pending admin approval.`,
            'WITHDRAWAL_REQUEST',
            withdrawalRequest.id,
            {
              withdrawalRequestId: withdrawalRequest.id,
              amount: withdrawalRequest.amount,
              currency: withdrawalRequest.currency,
              status: 'pending',
            },
          );
        }
      } catch (notificationError) {
        console.error(
          'Error sending withdrawal request notifications:',
          notificationError,
        );
        // Don't fail the request creation if notification fails
      }

      return res.status(HttpStatus.CREATED).json({
        status: HttpStatus.CREATED,
        message:
          'Withdrawal request created successfully. Waiting for admin approval.',
        data: withdrawalRequest,
      });
    } catch (error) {
      const status =
        error instanceof ForbiddenException
          ? HttpStatus.FORBIDDEN
          : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        status,
        message: error?.message || 'Failed to create withdrawal request',
      });
    }
  }

  // ===================================ADMIN WITHDRAWAL ENDPOINTS========================

  @Get('/admin/withdrawals')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @ApiOperation({
    summary: 'Get all withdrawal requests (Admin only)',
    description:
      'Get all withdrawal requests with optional filtering by status, userId, and pagination',
  })
  async getAllWithdrawals(
    @Query() query: GetWithdrawalsQueryDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.walletService.getAllWithdrawalRequests({
        status: query.status,
        userId: query.userId,
        page: query.page || 1,
        pageSize: query.pageSize || 20,
      });

      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message: 'Withdrawal requests fetched successfully',
        data: result,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to fetch withdrawal requests',
      });
    }
  }

  @Get('/admin/withdrawals/:id')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @ApiOperation({
    summary: 'Get withdrawal request by ID (Admin only)',
  })
  async getWithdrawalById(@Param('id') id: string, @Res() res: Response) {
    try {
      const request = await this.walletService.getWithdrawalRequestById(id);
      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message: 'Withdrawal request fetched successfully',
        data: request,
      });
    } catch (error) {
      const status =
        error instanceof NotFoundException
          ? HttpStatus.NOT_FOUND
          : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        status,
        message: error?.message || 'Failed to fetch withdrawal request',
      });
    }
  }

  @Post('/admin/withdrawals/approve')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @ApiOperation({
    summary: 'Approve a withdrawal request (Admin only)',
    description:
      'Approves a withdrawal request and debits the user wallet. Sends notification to user.',
  })
  async approveWithdrawal(
    @Users('sub') adminId: string,
    @Body() dto: ApproveWithdrawalDto,
    @Res() res: Response,
  ) {
    try {
      const request = await this.walletService.approveWithdrawalRequest(
        dto.withdrawalRequestId,
        adminId,
      );

      // Send email and push notification
      try {
        // User is already loaded in request relations
        const user =
          request.user ||
          (await this.walletService.getUserById(request.userId));
        if (user) {
          // Send email notification
          await this.mailService.sendWithdrawalApprovedEmail(request, user);

          // Send push notification
          await this.notificationService.sendCustomNotification(
            request.userId,
            'Withdrawal Approved',
            `Your withdrawal request of ${request.amount} ${request.currency} has been approved and processed successfully.`,
            'WITHDRAWAL_APPROVED',
            request.id,
            {
              withdrawalRequestId: request.id,
              amount: request.amount,
              currency: request.currency,
            },
          );
        }
      } catch (notificationError) {
        console.error(
          'Error sending approval notifications:',
          notificationError,
        );
        // Don't fail the approval if notification fails
      }

      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message: 'Withdrawal request approved successfully',
        data: request,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to approve withdrawal request',
      });
    }
  }

  @Post('/admin/withdrawals/reject')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @ApiOperation({
    summary: 'Reject a withdrawal request (Admin only)',
    description:
      'Rejects a withdrawal request. Requires rejection reason. Sends notification to user.',
  })
  async rejectWithdrawal(
    @Users('sub') adminId: string,
    @Body() dto: RejectWithdrawalDto,
    @Res() res: Response,
  ) {
    try {
      const request = await this.walletService.rejectWithdrawalRequest(
        dto.withdrawalRequestId,
        adminId,
        dto.rejectionReason,
      );

      // Send email and push notification
      try {
        // User is already loaded in request relations
        const user =
          request.user ||
          (await this.walletService.getUserById(request.userId));
        if (user) {
          // Send email notification
          await this.mailService.sendWithdrawalRejectedEmail(
            request,
            user,
            dto.rejectionReason,
          );

          // Send push notification
          await this.notificationService.sendCustomNotification(
            request.userId,
            'Withdrawal Rejected',
            `Your withdrawal request of ${request.amount} ${request.currency} has been rejected. Reason: ${dto.rejectionReason}`,
            'WITHDRAWAL_REJECTED',
            request.id,
            {
              withdrawalRequestId: request.id,
              amount: request.amount,
              currency: request.currency,
              rejectionReason: dto.rejectionReason,
            },
          );
        }
      } catch (notificationError) {
        console.error(
          'Error sending rejection notifications:',
          notificationError,
        );
        // Don't fail the rejection if notification fails
      }

      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message: 'Withdrawal request rejected successfully',
        data: request,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to reject withdrawal request',
      });
    }
  }
}
