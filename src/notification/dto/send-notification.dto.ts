
import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendNotificationDto {
  @ApiProperty({
    description: 'User ID to send notification to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID('4', { message: 'User ID must be a valid UUID' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId: string;

  @ApiProperty({
    description: 'Notification title',
    example: 'Order Update',
  })
  @IsString()
  @IsNotEmpty({ message: 'Title is required' })
  title: string;

  @ApiProperty({
    description: 'Notification message/body',
    example: 'Your order has been updated',
  })
  @IsString()
  @IsNotEmpty({ message: 'Body is required' })
  body: string;

  @ApiPropertyOptional({
    description: 'Notification type (e.g., ORDER_UPDATE, MESSAGE, etc.)',
    example: 'ORDER_UPDATE',
  })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({
    description: 'Type ID (e.g., order ID, message ID, etc.)',
    example: '123e4567-e89b-12d3-a456-426614174000',
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

