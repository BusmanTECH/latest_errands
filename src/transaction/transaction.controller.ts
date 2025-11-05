
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpStatus,
  UseGuards,
  Res,
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { AuthGuard } from '@nestjs/passport';
import { Users } from 'src/decorators/user.decorator';
import { AdminGuard } from '../guards/admin.guard';
import { Response } from 'express';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import {
  TransactionType,
  TransactionStatus,
} from './entities/transaction.entity';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('transaction')
@Controller('transaction')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new transaction' })
  async createTransaction(
    @Users() user: any,
    @Body() dto: CreateTransactionDto,
    @Res() res: Response,
  ) {
    try {
      const userId = user?.id || user?.sub;
      const userRole = user?.role?.toLowerCase() || user?.role;
      const isRider = userRole === 'rider' || userRole === 'RIDER';

      
      if (!dto.userId && !dto.driverId) {
        if (isRider) {
          dto.driverId = userId;
        } else {
          dto.userId = userId;
        }
      }

      const transaction = await this.transactionService.createTransaction(dto);
      const serializedTransaction =
        this.transactionService.serializeTransaction(transaction);
      return res.status(HttpStatus.CREATED).json({
        status: HttpStatus.CREATED,
        message: 'Transaction created successfully',
        data: serializedTransaction,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to create transaction',
      });
    }
  }

  @Get('/admin/all')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @ApiOperation({ summary: 'Get all transactions (Admin only)' })
  async getAllTransactionsAdmin(
    @Query('page') page: number,
    @Query() query: any,
    @Res() res: Response,
  ) {
    try {
      const { page: _, ...filters } = query; 
      const transactions = await this.transactionService.getAllTransactions(
        page || 1,
        filters,
      );

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Transactions fetch successfully',
        data: transactions,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to fetch transactions',
      });
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get transactions for authenticated user or rider' })
  async getTransactions(
    @Users() user: any,
    @Res() res: Response,
    @Query('type') type?: TransactionType,
    @Query('status') status?: TransactionStatus,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    try {
      const userId = user?.id || user?.sub;
      if (!userId) {
        return res.status(HttpStatus.UNAUTHORIZED).json({
          status: HttpStatus.UNAUTHORIZED,
          message: 'User ID not found in token',
        });
      }

      
      const userRole = user?.role?.toLowerCase() || user?.role;
      const isRider = userRole === 'rider' || userRole === 'RIDER';

      
      
      const result = await this.transactionService.getTransactions(userId, {
        type,
        status,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      });

      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message: `Transactions fetched successfully for ${isRider ? 'rider' : 'user'}`,
        data: result,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to fetch transactions',
      });
    }
  }

  @Get('/:id')
  @ApiOperation({ summary: 'Get transaction by ID' })
  async getTransactionById(@Param('id') id: string, @Res() res: Response) {
    try {
      const transaction =
        await this.transactionService.getSerializedTransactionById(id);
      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message: 'Transaction fetched successfully',
        data: transaction,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to fetch transaction',
      });
    }
  }
}
