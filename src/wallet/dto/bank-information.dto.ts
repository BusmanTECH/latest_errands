import {
  IsString,
  IsNotEmpty,
  IsOptional,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBankInformationDto {
  @ApiProperty({
    description: 'Account holder name',
    example: 'John Doe',
  })
  @IsString()
  @IsNotEmpty({ message: 'Account name is required' })
  @MinLength(2, { message: 'Account name must be at least 2 characters' })
  @MaxLength(255, { message: 'Account name must not exceed 255 characters' })
  accountName: string;

  @ApiProperty({
    description: 'Bank account number (typically 10 digits for Nigerian banks)',
    example: '1234567890',
  })
  @IsString()
  @IsNotEmpty({ message: 'Account number is required' })
  @Matches(/^\d{10,20}$/, {
    message: 'Account number must be between 10 and 20 digits',
  })
  accountNumber: string;

  @ApiProperty({
    description: 'Bank name',
    example: 'Access Bank',
  })
  @IsString()
  @IsNotEmpty({ message: 'Bank name is required' })
  @MinLength(2, { message: 'Bank name must be at least 2 characters' })
  @MaxLength(255, { message: 'Bank name must not exceed 255 characters' })
  bankName: string;

  @ApiPropertyOptional({
    description: 'Bank code (for Nigerian banks)',
    example: '044',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d{3}$/, {
    message: 'Bank code must be 3 digits',
  })
  bankCode?: string;
}

export class UpdateBankInformationDto {
  @ApiPropertyOptional({
    description: 'Account holder name',
    example: 'John Doe',
  })
  @IsString()
  @IsOptional()
  @MinLength(2, { message: 'Account name must be at least 2 characters' })
  @MaxLength(255, { message: 'Account name must not exceed 255 characters' })
  accountName?: string;

  @ApiPropertyOptional({
    description: 'Bank account number (typically 10 digits for Nigerian banks)',
    example: '1234567890',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d{10,20}$/, {
    message: 'Account number must be between 10 and 20 digits',
  })
  accountNumber?: string;

  @ApiPropertyOptional({
    description: 'Bank name',
    example: 'Access Bank',
  })
  @IsString()
  @IsOptional()
  @MinLength(2, { message: 'Bank name must be at least 2 characters' })
  @MaxLength(255, { message: 'Bank name must not exceed 255 characters' })
  bankName?: string;

  @ApiPropertyOptional({
    description: 'Bank code (for Nigerian banks)',
    example: '044',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d{3}$/, {
    message: 'Bank code must be 3 digits',
  })
  bankCode?: string;
}

