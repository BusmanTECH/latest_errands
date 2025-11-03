import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsNumber,
  IsOptional,
  IsUrl,
} from 'class-validator';

export class InitializeCardAuthorizationDto {
  @ApiProperty({ description: 'Email address of the user' })
  @IsEmail()
  email: string;
}

export class SaveCardDto {
  @ApiProperty({ description: 'Authorization code from Paystack' })
  @IsString()
  authorizationCode: string;

  @ApiProperty({ description: 'Reference from Paystack transaction' })
  @IsString()
  reference: string;

  @ApiPropertyOptional({ description: 'Card name/nickname' })
  @IsString()
  @IsOptional()
  cardName?: string;
}
