import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { DeliveryType, OrderStatus } from './entities/order.entity';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/entities/notification.entity';
import { MailService } from '../mail/mail.service';

@Injectable()
export class OrderReminderService {
  private readonly logger = new Logger(OrderReminderService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Runs every hour to check for scheduled orders that need reminders
   * Sends reminders for orders scheduled within the next 24 hours
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleScheduledOrderReminders() {
    this.logger.log('Running scheduled order reminders check...');
    
    try {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(23, 59, 59, 999);

      // Find scheduled orders that:
      // 1. Are scheduled type
      // 2. Have a scheduledPickupTime
      // 3. Are scheduled within the next 24 hours
      // 4. Are not started, completed, or cancelled
      const scheduledOrders = await this.orderRepo.find({
        where: [
          {
            deliveryType: DeliveryType.SCHEDULE,
            status: OrderStatus.ACCEPTED, // Orders accepted by rider
          },
          {
            deliveryType: DeliveryType.SCHEDULE,
            status: OrderStatus.ASSIGNED, // Orders assigned but not yet accepted
          },
          {
            deliveryType: DeliveryType.SCHEDULE,
            status: OrderStatus.NEW, // New orders without rider yet
          },
        ],
        relations: ['user', 'driver'],
      });

      if (!scheduledOrders || scheduledOrders.length === 0) {
        this.logger.log('No scheduled orders found for reminders');
        return;
      }

      let reminderCount = 0;

      for (const order of scheduledOrders) {
        if (!order.scheduledPickupTime) {
          continue;
        }

        try {
          const scheduledDate = new Date(order.scheduledPickupTime);
          const hoursUntilPickup = (scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60);

          // Send reminder if scheduled within next 24 hours and not already started
          if (hoursUntilPickup > 0 && hoursUntilPickup <= 24) {
            // Always send reminder to user who created the order
            if (order.user && order.userId) {
              await this.sendUserReminder(order);
              reminderCount++;
            }

            // Send reminder to rider (driver) only if order is accepted
            if (order.driver && order.driverId && order.status === OrderStatus.ACCEPTED) {
              await this.sendRiderReminder(order);
              reminderCount++;
            }

            this.logger.log(
              `Sent reminder for order ${order.trackingCode} scheduled for ${scheduledDate.toISOString()}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Error sending reminder for order ${order.id}: ${error.message}`,
          );
        }
      }

      this.logger.log(`Completed reminder check. Sent ${reminderCount} reminders.`);
    } catch (error) {
      this.logger.error(`Error in scheduled order reminders: ${error.message}`, error.stack);
    }
  }

  /**
   * Send reminder notification to the user
   */
  private async sendUserReminder(order: Order) {
    try {
      const scheduledDate = new Date(order.scheduledPickupTime);
      const hoursUntilPickup = Math.round(
        (scheduledDate.getTime() - new Date().getTime()) / (1000 * 60 * 60),
      );

      let title = 'Upcoming Scheduled Order Reminder';
      let message = `Your scheduled order ${order.trackingCode} is coming up soon. `;

      if (hoursUntilPickup <= 1) {
        message += `Pickup is scheduled in less than an hour. Please be ready!`;
      } else if (hoursUntilPickup <= 6) {
        message += `Pickup is scheduled in ${hoursUntilPickup} hours. Please prepare your package.`;
      } else {
        message += `Pickup is scheduled on ${scheduledDate.toLocaleDateString()} at ${scheduledDate.toLocaleTimeString()}.`;
      }

      // Send push notification
      await this.notificationService.sendCustomNotification(
        order.userId.toString(),
        title,
        message,
        NotificationType.CUSTOM,
        order.id,
        {
          orderId: order.id,
          trackingCode: order.trackingCode,
          scheduledPickupTime: order.scheduledPickupTime,
          type: 'SCHEDULED_ORDER_REMINDER',
        },
      );

      // Send email if user has email
      if (order.user && (order.user as any).email) {
        try {
          // You can create a dedicated email template for reminders if needed
          // For now, we'll just send a notification
          this.logger.log(`Reminder notification sent to user ${order.userId}`);
        } catch (emailError) {
          this.logger.error(`Error sending reminder email to user: ${emailError.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error sending user reminder: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send reminder notification to the rider
   */
  private async sendRiderReminder(order: Order) {
    try {
      const scheduledDate = new Date(order.scheduledPickupTime);
      const hoursUntilPickup = Math.round(
        (scheduledDate.getTime() - new Date().getTime()) / (1000 * 60 * 60),
      );

      let title = 'Upcoming Scheduled Order Reminder';
      let message = `You have a scheduled order ${order.trackingCode} coming up. `;

      if (hoursUntilPickup <= 1) {
        message += `Pickup is scheduled in less than an hour. You can start the order now!`;
      } else if (hoursUntilPickup <= 6) {
        message += `Pickup is scheduled in ${hoursUntilPickup} hours. Please prepare for pickup.`;
      } else {
        message += `Pickup is scheduled on ${scheduledDate.toLocaleDateString()} at ${scheduledDate.toLocaleTimeString()}.`;
      }

      // Send push notification
      await this.notificationService.sendCustomNotification(
        order.driverId.toString(),
        title,
        message,
        NotificationType.CUSTOM,
        order.id,
        {
          orderId: order.id,
          trackingCode: order.trackingCode,
          scheduledPickupTime: order.scheduledPickupTime,
          type: 'SCHEDULED_ORDER_REMINDER',
        },
      );

      // Send email if rider has email
      if (order.driver && (order.driver as any).email) {
        try {
          this.logger.log(`Reminder notification sent to rider ${order.driverId}`);
        } catch (emailError) {
          this.logger.error(`Error sending reminder email to rider: ${emailError.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error sending rider reminder: ${error.message}`);
      throw error;
    }
  }
}

