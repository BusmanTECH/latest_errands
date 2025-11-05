
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Notification, NotificationType } from './entities/notification.entity';
import { PushToken, DeviceType } from './entities/push-token.entity';
import { User } from '../auth/entities/user.entity';
import axios from 'axios';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly EXPO_BATCH_LIMIT = 100;

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(PushToken)
    private readonly pushTokenRepo: Repository<PushToken>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  
  async registerPushToken(
    userId: string,
    token: string,
    deviceType: DeviceType,
  ): Promise<PushToken> {
    
    const existingToken = await this.pushTokenRepo.findOne({
      where: { userId, token },
    });

    if (existingToken) {
      
      existingToken.deviceType = deviceType;
      existingToken.updatedAt = new Date();
      return await this.pushTokenRepo.save(existingToken);
    }

    
    const tokenExists = await this.pushTokenRepo.findOne({
      where: { token },
    });

    if (tokenExists && tokenExists.userId !== userId) {
      
      tokenExists.userId = userId;
      tokenExists.deviceType = deviceType;
      tokenExists.updatedAt = new Date();
      return await this.pushTokenRepo.save(tokenExists);
    }

    
    const pushToken = this.pushTokenRepo.create({
      userId,
      token,
      deviceType,
    });

    return await this.pushTokenRepo.save(pushToken);
  }

  
  private async sendExpoNotifications(
    tokens: string[],
    title: string,
    body: string,
    type: string,
    typeId: string,
    user: any,
  ) {
    const responses: any[] = [];

    if (!tokens || tokens.length === 0) return responses;

    
    for (let i = 0; i < tokens.length; i += this.EXPO_BATCH_LIMIT) {
      const batch = tokens.slice(i, i + this.EXPO_BATCH_LIMIT);
      const messages = batch.map((token) => ({
        to: token,
        sound: 'default',
        title,
        body,
        data: {
          type,
          typeId,
          userId: user?._id?.toString?.() || user?.id?.toString() || '',
          username: user?.username || user?.firstName || '',
          profilePicture: user?.profilePicture || '',
          created_at: new Date().toISOString(),
        },
        priority: 'high',
        channelId: 'default',
      }));

      try {
        const { data } = await axios.post(
          'https://exp.host/--/api/v2/push/send',
          messages,
          {
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            timeout: 20000,
          },
        );

        
        const results = Array.isArray(data?.data) ? data.data : [];
        results.forEach((res: any, idx: number) => {
          responses.push({
            token: batch[idx],
            platform: 'expo',
            success: res.status === 'ok',
            messageId: res.id || null,
            error: res.status === 'error' ? res.message : null,
            raw: res,
          });
        });
      } catch (err: any) {
        this.logger.error('Expo push batch error', err?.message || err);
        
        batch.forEach((token) =>
          responses.push({
            token,
            platform: 'expo',
            success: false,
            error: err?.response?.data || err?.message || 'Expo API error',
          }),
        );
      }
    }

    return responses;
  }

  
  async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    data?: any,
  ): Promise<void> {
    try {
      
      const tokens = await this.pushTokenRepo.find({
        where: { userId },
      });

      if (tokens.length === 0) {
        this.logger.warn(`No push tokens found for user ${userId}`);
        return;
      }

      
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) {
        this.logger.warn(`User not found: ${userId}`);
        return;
      }

      
      const tokenStrings = tokens.map((t) => t.token).filter(Boolean);

      if (tokenStrings.length === 0) {
        this.logger.warn(`No valid push tokens found for user ${userId}`);
        return;
      }

      
      const notificationType = data?.type || 'ORDER_UPDATE';
      const typeId = data?.orderId || data?.typeId || '';

      
      const responses = await this.sendExpoNotifications(
        tokenStrings,
        title,
        body,
        notificationType,
        typeId,
        user,
      );

      
      responses.forEach((response) => {
        if (!response.success) {
          this.logger.warn(
            `Failed to send notification to token ${response.token}: ${response.error}`,
          );
          
          if (
            response.error?.includes('DeviceNotRegistered') ||
            response.error?.includes('InvalidCredentials') ||
            response.error?.includes('InvalidToken')
          ) {
            this.pushTokenRepo.delete({ token: response.token });
          }
        }
      });
    } catch (error) {
      this.logger.error('Error sending push notification:', error);
      
    }
  }

  
  async createInAppNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: any,
  ): Promise<Notification> {
    const notification = this.notificationRepo.create({
      userId,
      type,
      title,
      message,
      data,
      isRead: false,
    });

    return await this.notificationRepo.save(notification);
  }

  
  async getUserNotifications(
    userId: string,
    page: number = 1,
    pageSize: number = 20,
    read?: boolean,
  ): Promise<{
    notifications: Notification[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * pageSize;
    const where: any = { userId };

    if (read !== undefined) {
      where.isRead = read;
    }

    const [notifications, total] = await this.notificationRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: pageSize,
    });

    return {
      notifications,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  
  async markAsRead(
    notificationId: string,
    userId: string,
  ): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isRead = true;
    notification.readAt = new Date();

    return await this.notificationRepo.save(notification);
  }

  
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepo.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
  }

  
  async getUnreadCount(userId: string): Promise<number> {
    return await this.notificationRepo.count({
      where: { userId, isRead: false },
    });
  }

  
  async sendOrderNotification(
    userId: string,
    type: NotificationType,
    order: any,
    additionalData?: any,
  ): Promise<void> {
    const { title, message } = this.getOrderNotificationContent(type, order);

    const data = {
      type,
      orderId: order.id,
      trackingCode: order.trackingCode,
      ...additionalData,
    };

    
    this.sendPushNotification(userId, title, message, data).catch((error) => {
      this.logger.error('Error sending push notification:', error);
    });

    
    this.createInAppNotification(userId, type, title, message, data).catch(
      (error) => {
        this.logger.error('Error creating in-app notification:', error);
      },
    );
  }

  
  async sendCustomNotification(
    userId: string,
    title: string,
    body: string,
    type?: string,
    typeId?: string,
    data?: any,
  ): Promise<{
    pushSent: boolean;
    pushResponses?: any[];
    inAppCreated: boolean;
    notification?: Notification;
  }> {
    const results = {
      pushSent: false,
      pushResponses: [] as any[],
      inAppCreated: false,
      notification: null as Notification | null,
    };

    try {
      
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      
      const tokens = await this.pushTokenRepo.find({
        where: { userId },
      });

      const notificationType = type || 'CUSTOM';
      const notificationTypeId = typeId || '';

      if (tokens.length > 0) {
        const tokenStrings = tokens.map((t) => t.token).filter(Boolean);

        
        const pushResponses = await this.sendExpoNotifications(
          tokenStrings,
          title,
          body,
          notificationType,
          notificationTypeId,
          user,
        );

        results.pushSent = true;
        results.pushResponses = pushResponses;

        
        pushResponses.forEach((response) => {
          if (!response.success) {
            if (
              response.error?.includes('DeviceNotRegistered') ||
              response.error?.includes('InvalidCredentials') ||
              response.error?.includes('InvalidToken')
            ) {
              this.pushTokenRepo.delete({ token: response.token });
            }
          }
        });
      }

      
      
      let notificationTypeEnum: NotificationType;
      if (
        type &&
        Object.values(NotificationType).includes(type as NotificationType)
      ) {
        notificationTypeEnum = type as NotificationType;
      } else {
        
        notificationTypeEnum = NotificationType.CUSTOM;
      }

      const notification = await this.createInAppNotification(
        userId,
        notificationTypeEnum,
        title,
        body,
        {
          type: notificationType,
          typeId: notificationTypeId,
          ...data,
        },
      );

      results.inAppCreated = true;
      results.notification = notification;

      return results;
    } catch (error) {
      this.logger.error('Error sending custom notification:', error);
      throw error;
    }
  }

  
  private getOrderNotificationContent(
    type: NotificationType,
    order: any,
  ): { title: string; message: string } {
    const trackingCode = order.trackingCode || 'N/A';

    switch (type) {
      case NotificationType.ORDER_CREATED:
        return {
          title: 'Order Created',
          message: `Your order ${trackingCode} has been created successfully`,
        };

      case NotificationType.ORDER_ASSIGNED:
        return {
          title: 'New Order Assignment',
          message: `You have been assigned order ${trackingCode}`,
        };

      case NotificationType.ORDER_ACCEPTED:
        return {
          title: 'Order Accepted',
          message: `Rider has accepted your order ${trackingCode}`,
        };

      case NotificationType.ORDER_STARTED:
        return {
          title: 'Order Started',
          message: `Your order ${trackingCode} is on the way`,
        };

      case NotificationType.ORDER_COMPLETED:
        return {
          title: 'Order Completed',
          message: `Your order ${trackingCode} has been delivered successfully`,
        };

      case NotificationType.ORDER_REJECTED:
        return {
          title: 'Order Assignment Update',
          message: `Order ${trackingCode} assignment was rejected. It will be reassigned`,
        };

      default:
        return {
          title: 'Order Update',
          message: `Update on your order ${trackingCode}`,
        };
    }
  }
}
