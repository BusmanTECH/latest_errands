
import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Users } from '../decorators/user.decorator';
import { NotificationService } from './notification.service';
import { RegisterTokenDto } from './dto/register-token.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import {
  NotificationResponseDto,
  NotificationsListResponseDto,
  UnreadCountResponseDto,
} from './dto/notification-response.dto';

@ApiTags('notification')
@Controller('notification')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('/token')
  @ApiOperation({ summary: 'Register or update push notification token' })
  @ApiResponse({ status: 201, description: 'Token registered/updated successfully' })
  async registerToken(
    @Users() user: any,
    @Body() dto: RegisterTokenDto,
  ) {
    try {
      const userId = user.id || user.sub || user._id?.toString();
      if (!userId) {
        throw new HttpException('User ID not found', HttpStatus.BAD_REQUEST);
      }

      const token = await this.notificationService.registerPushToken(
        userId,
        dto.token,
        dto.deviceType,
      );

      return {
        success: true,
        message: 'Push token registered/updated successfully',
        data: token,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to register push token',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get()
  @ApiOperation({ summary: 'Get user notifications' })
  @ApiResponse({
    status: 200,
    description: 'Notifications fetched successfully',
    type: NotificationsListResponseDto,
  })
  async getNotifications(
    @Users() user: any,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('read') read?: string,
  ) {
    try {
      const userId = user.id || user.sub || user._id?.toString();
      if (!userId) {
        throw new HttpException('User ID not found', HttpStatus.BAD_REQUEST);
      }

      const readFilter =
        read !== undefined ? read === 'true' || read === '1' : undefined;

      const result = await this.notificationService.getUserNotifications(
        userId,
        page ? Number(page) : 1,
        pageSize ? Number(pageSize) : 20,
        readFilter,
      );

      return {
        success: true,
        message: 'Notifications fetched successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch notifications',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('/unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiResponse({
    status: 200,
    description: 'Unread count fetched successfully',
    type: UnreadCountResponseDto,
  })
  async getUnreadCount(@Users() user: any) {
    try {
      const userId = user.id || user.sub || user._id?.toString();
      if (!userId) {
        throw new HttpException('User ID not found', HttpStatus.BAD_REQUEST);
      }

      const count = await this.notificationService.getUnreadCount(userId);

      return {
        success: true,
        message: 'Unread count fetched successfully',
        data: { count },
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch unread count',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Patch('/:id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read',
    type: NotificationResponseDto,
  })
  async markAsRead(@Users() user: any, @Param('id') id: string) {
    try {
      const userId = user.id || user.sub || user._id?.toString();
      if (!userId) {
        throw new HttpException('User ID not found', HttpStatus.BAD_REQUEST);
      }

      const notification = await this.notificationService.markAsRead(id, userId);

      return {
        success: true,
        message: 'Notification marked as read',
        data: notification,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to mark notification as read',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Patch('/read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read',
  })
  async markAllAsRead(@Users() user: any) {
    try {
      const userId = user.id || user.sub || user._id?.toString();
      if (!userId) {
        throw new HttpException('User ID not found', HttpStatus.BAD_REQUEST);
      }

      await this.notificationService.markAllAsRead(userId);

      return {
        success: true,
        message: 'All notifications marked as read',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to mark all notifications as read',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('/send')
  @ApiOperation({ summary: 'Send custom notification to a user' })
  @ApiResponse({
    status: 201,
    description: 'Notification sent successfully',
  })
  async sendNotification(
    @Users() user: any,
    @Body() dto: SendNotificationDto,
  ) {
    try {
      
      const currentUserId = user.id || user.sub || user._id?.toString();
      const userRole = user?.role?.toLowerCase() || user?.role;

      if (userRole !== 'admin' && currentUserId !== dto.userId) {
        throw new HttpException(
          'You do not have permission to send notifications to other users',
          HttpStatus.FORBIDDEN,
        );
      }

      const result = await this.notificationService.sendCustomNotification(
        dto.userId,
        dto.title,
        dto.body,
        dto.type,
        dto.typeId,
        dto.data,
      );

      return {
        success: true,
        message: 'Notification sent successfully',
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to send notification',
        error.status || HttpStatus.BAD_REQUEST,
      );
    }
  }
}

