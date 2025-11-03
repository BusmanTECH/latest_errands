/* eslint-disable prettier/prettier */
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsEnum,
  IsBoolean,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum RecipientType {
  SPECIFIC_USERS = 'specific_users',
  ALL_USERS = 'all_users',
  SPECIFIC_RIDERS = 'specific_riders',
  ALL_RIDERS = 'all_riders',
}

export class SendAdminNotificationDto {
  @ApiProperty({
    description: 'Type of recipients',
    enum: RecipientType,
    example: RecipientType.ALL_USERS,
  })
  @IsEnum(RecipientType)
  @IsNotEmpty()
  recipientType: RecipientType;

  @ApiPropertyOptional({
    description: 'Array of user IDs (required if recipientType is SPECIFIC_USERS or SPECIFIC_RIDERS)',
    type: [String],
    example: ['user-id-1', 'user-id-2'],
  })
  @IsArray()
  @IsString({ each: true })
  @ValidateIf((o) => 
    o.recipientType === RecipientType.SPECIFIC_USERS || 
    o.recipientType === RecipientType.SPECIFIC_RIDERS
  )
  @IsNotEmpty()
  userIds?: string[];

  @ApiProperty({
    description: 'Notification title',
    example: 'Important Announcement',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    description: 'Notification message/body',
    example: 'This is an important announcement for all users.',
  })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiPropertyOptional({
    description: 'Send email notification',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  sendEmail?: boolean;

  @ApiPropertyOptional({
    description: 'Send push notification',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  sendPush?: boolean;

  @ApiPropertyOptional({
    description: 'Send in-app notification',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  sendInApp?: boolean;

  @ApiPropertyOptional({
    description: 'Notification type (e.g., CUSTOM, ORDER_UPDATE, etc.)',
    example: 'CUSTOM',
  })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    description: 'Type ID (e.g., order ID, message ID, etc.)',
  })
  @IsString()
  @IsOptional()
  typeId?: string;

  @ApiPropertyOptional({
    description: 'Additional data to include in notification',
  })
  @IsOptional()
  data?: any;
}


