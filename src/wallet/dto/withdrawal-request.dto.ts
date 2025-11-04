import { IsString, IsOptional, IsUUID, IsEnum, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WithdrawalStatus } from '../entities/withdrawal-request.entity';

export class CreateWithdrawalRequestDto {
  @ApiProperty({ description: 'Amount to withdraw from wallet', example: 1000.0 })
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @ApiPropertyOptional({ description: 'Withdrawal narration/description' })
  @IsString()
  @IsOptional()
  narration?: string;
}

export class ApproveWithdrawalDto {
  @ApiProperty({ description: 'Withdrawal request ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  withdrawalRequestId: string;
}

export class RejectWithdrawalDto {
  @ApiProperty({ description: 'Withdrawal request ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  withdrawalRequestId: string;

  @ApiProperty({ description: 'Reason for rejection', example: 'Insufficient documentation provided' })
  @IsString()
  rejectionReason: string;
}

export class GetWithdrawalsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status', enum: WithdrawalStatus })
  @IsEnum(WithdrawalStatus)
  @IsOptional()
  status?: WithdrawalStatus;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ description: 'Page number', example: 1, default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Page size', example: 20, default: 20 })
  @IsOptional()
  pageSize?: number;
}
