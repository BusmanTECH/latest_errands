/* eslint-disable prettier/prettier */
import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from '../entities/notification.entity';

export class NotificationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: NotificationType })
  type: NotificationType;

  @ApiProperty()
  title: string;

  @ApiProperty()
  message: string;

  @ApiProperty({ required: false })
  data?: any;

  @ApiProperty()
  isRead: boolean;

  @ApiProperty({ required: false })
  readAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class NotificationsListResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  notifications: NotificationResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  totalPages: number;
}

export class UnreadCountResponseDto {
  @ApiProperty()
  count: number;
}

