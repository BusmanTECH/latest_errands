import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  TransactionType,
  TransactionStatus,
} from '../entities/transaction.entity';

export class CreateTransactionDto {
  @ApiPropertyOptional({ description: 'User ID (for user transactions)' })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ description: 'Driver ID (for driver transactions)' })
  @IsUUID()
  @IsOptional()
  driverId?: string;

  @ApiPropertyOptional({ description: 'Order ID (if transaction is related to an order)' })
  @IsString()
  @IsOptional()
  orderId?: string;

  @ApiPropertyOptional({ description: 'Transaction narration/description' })
  @IsString()
  @IsOptional()
  narration?: string;

  @ApiProperty({
    description: 'Transaction type',
    enum: TransactionType,
    example: TransactionType.CREDIT,
  })
  @IsEnum(TransactionType)
  type: TransactionType;

  @ApiProperty({
    description: 'Transaction status',
    enum: TransactionStatus,
    example: TransactionStatus.INITIATED,
  })
  @IsEnum(TransactionStatus)
  @IsOptional()
  status?: TransactionStatus;

  @ApiProperty({ description: 'Transaction amount', example: 5000.0 })
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @ApiPropertyOptional({
    description: 'Currency code',
    example: 'NGN',
    default: 'NGN',
  })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ description: 'Transaction reference (unique)' })
  @IsString()
  @IsOptional()
  reference?: string;
}

