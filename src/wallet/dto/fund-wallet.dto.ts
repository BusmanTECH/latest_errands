import { IsNumber, IsString, IsOptional, Min, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FundWalletDto {
  @ApiProperty({ description: 'Amount to fund wallet', example: 5000.0 })
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @ApiPropertyOptional({ description: 'Currency code', example: 'NGN', default: 'NGN' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ description: 'Callback URL for Paystack redirect after payment', example: 'https://example.com/payment/callback' })
  @IsUrl({}, { message: 'Callback URL must be a valid URL' })
  @IsOptional()
  callbackUrl?: string;
}

export class WithdrawWalletDto {
  @ApiProperty({ description: 'Amount to withdraw from wallet', example: 1000.0 })
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @ApiPropertyOptional({ description: 'Withdrawal narration/description' })
  @IsString()
  @IsOptional()
  narration?: string;
}

