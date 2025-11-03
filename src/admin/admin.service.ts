/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between, Not, In } from 'typeorm';
import { User, UserRole } from '../auth/entities/user.entity';
import { Order, OrderStatus } from '../order/entities/order.entity';
import { Transaction } from '../transaction/entities/transaction.entity';
import { NotificationService } from '../notification/notification.service';
import { MailService } from '../mail/mail.service';
import { SendAdminNotificationDto, RecipientType } from './dto/send-admin-notification.dto';
import { NotificationType } from '../notification/entities/notification.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly notificationService: NotificationService,
    private readonly mailService: MailService,
  ) {}

  // ========== USER MANAGEMENT ==========
  async getAllUsers(page: number = 1, limit: number = 20, search?: string) {
    const skip = (page - 1) * limit;

    // Build where conditions - exclude admin users and deleted accounts
    const where: any = { 
      role: Not(UserRole.ADMIN),
      deletedAt: null, // Exclude deleted accounts
    };

    if (!search) {
      // Simple case: no search, use findAndCount directly
      const [data, total] = await this.userRepository.findAndCount({
        where,
        relations: ['profileImage'],

        skip,
        take: limit,
      });

      return {
        data: data.map((user) => this.sanitizeUser(user)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    // With search: fetch all matching records, then paginate in memory
    // This is necessary because repository find doesn't support ILIKE searches directly
    const [allData] = await this.userRepository.findAndCount({
      where,
      relations: ['profileImage'],
      order: { createdAt: 'DESC' } as any,
    });

    // Filter by search
    const searchLower = search.toLowerCase();
    const filteredData = allData.filter(
      (user) =>
        user.firstName?.toLowerCase().includes(searchLower) ||
        user.lastName?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower) ||
        user.phoneNumber?.toLowerCase().includes(searchLower),
    );

    // Apply pagination
    const paginatedData = filteredData.slice(skip, skip + limit);

    return {
      data: paginatedData.map((user) => this.sanitizeUser(user)),
      total: filteredData.length,
      page,
      limit,
      totalPages: Math.ceil(filteredData.length / limit),
    };
  }

  async getUserById(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: [
        'profileImage',
        'vehicle',
        'driverLicense',
        'nin',
        'vehicleRegImage',
        'plateNumberImage',
        'licenseImage',
      ],
    });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitizeUser(user);
  }

  async updateUser(id: string, updateData: Partial<User>) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (updateData.email) {
      const existing = await this.userRepository.findOne({
        where: { email: updateData.email },
      });
      if (existing && existing.id !== id)
        throw new ConflictException('Email already exists');
    }

    if (updateData.phoneNumber) {
      const existing = await this.userRepository.findOne({
        where: { phoneNumber: updateData.phoneNumber },
      });
      if (existing && existing.id !== id)
        throw new ConflictException('Phone number already exists');
    }

    Object.assign(user, updateData);
    return this.sanitizeUser(await this.userRepository.save(user));
  }

  async deleteUser(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === UserRole.ADMIN)
      throw new BadRequestException('Cannot delete admin user');
    await this.userRepository.remove(user);
    return { message: 'User deleted successfully' };
  }

  async getDeletedAccounts(page: number = 1, limit: number = 20, search?: string) {
    const skip = (page - 1) * limit;

    // Build where condition to find deleted accounts
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .where('user.deletedAt IS NOT NULL')
      .leftJoinAndSelect('user.profileImage', 'profileImage')
      .orderBy('user.deletedAt', 'DESC')
      .skip(skip)
      .take(limit);

    // Apply search if provided
    if (search && search.trim() !== '') {
      const searchLower = search.toLowerCase();
      queryBuilder.andWhere(
        '(LOWER(user.firstName) LIKE :search OR LOWER(user.lastName) LIKE :search OR LOWER(user.email) LIKE :search OR LOWER(user.phoneNumber) LIKE :search)',
        { search: `%${searchLower}%` },
      );
    }

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data: data.map((user) => ({
        ...this.sanitizeUser(user),
        deletedAt: user.deletedAt,
        deletedReason: user.deletedReason,
        deletedBy: user.deletedBy,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async undeleteAccount(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.deletedAt) {
      throw new BadRequestException('Account is not deleted');
    }

    // Restore account by clearing deletion fields
    user.deletedAt = null;
    user.deletedReason = null;
    user.deletedBy = null;

    const restoredUser = await this.userRepository.save(user);

    return {
      success: true,
      message: 'Account restored successfully',
      data: this.sanitizeUser(restoredUser),
    };
  }

  async approveUser(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    user.isApproved = true;
    return this.sanitizeUser(await this.userRepository.save(user));
  }

  async rejectUser(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    user.isApproved = false;
    return this.sanitizeUser(await this.userRepository.save(user));
  }

  // ========== DRIVER MANAGEMENT ==========
  async getAllDrivers(page: number = 1, limit: number = 20, search?: string) {
    const skip = (page - 1) * limit;

    // Build where conditions - exclude deleted accounts
    const where: any = { 
      role: UserRole.RIDER,
      deletedAt: null, // Exclude deleted accounts
    };

    if (!search) {
      // Simple case: no search, use findAndCount directly
      const [data, total] = await this.userRepository.findAndCount({
        where,
        relations: ['profileImage', 'vehicle'],
        // order: { createdAt: 'DESC' } as any,
        skip,
        take: limit,
      });

      return {
        data: data.map((user) => this.sanitizeUser(user)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    }

    // With search: fetch all matching records, then paginate in memory
    // This is necessary because repository find doesn't support ILIKE searches directly
    const [allData] = await this.userRepository.findAndCount({
      where,
      relations: ['profileImage', 'vehicle'],
      order: { createdAt: 'DESC' } as any,
    });

    // Filter by search
    const searchLower = search.toLowerCase();
    const filteredData = allData.filter(
      (user) =>
        user.firstName?.toLowerCase().includes(searchLower) ||
        user.lastName?.toLowerCase().includes(searchLower) ||
        user.email?.toLowerCase().includes(searchLower) ||
        user.phoneNumber?.toLowerCase().includes(searchLower),
    );

    // Apply pagination
    const paginatedData = filteredData.slice(skip, skip + limit);

    return {
      data: paginatedData.map((user) => this.sanitizeUser(user)),
      total: filteredData.length,
      page,
      limit,
      totalPages: Math.ceil(filteredData.length / limit),
    };
  }

  async getDriverById(id: string) {
    const driver = await this.userRepository.findOne({
      where: { id, role: UserRole.RIDER },
      relations: [
        'profileImage',
        'vehicle',
        'driverLicense',
        'nin',
        'vehicleRegImage',
        'plateNumberImage',
        'licenseImage',
      ],
    });
    if (!driver) throw new NotFoundException('Driver not found');
    return this.sanitizeUser(driver);
  }

  async approveDriver(id: string) {
    const driver = await this.userRepository.findOne({
      where: { id, role: UserRole.RIDER },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    driver.isApproved = true;
    return this.sanitizeUser(await this.userRepository.save(driver));
  }

  async rejectDriver(id: string) {
    const driver = await this.userRepository.findOne({
      where: { id, role: UserRole.RIDER },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    driver.isApproved = false;
    return this.sanitizeUser(await this.userRepository.save(driver));
  }

  async toggleDriverOnlineStatus(id: string) {
    const driver = await this.userRepository.findOne({
      where: { id, role: UserRole.RIDER },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    driver.isOnline = !driver.isOnline;
    return this.sanitizeUser(await this.userRepository.save(driver));
  }

  // ========== ORDER MANAGEMENT ==========
  async getAllOrders(
    page: number = 1,
    limit: number = 20,
    filters?: {
      status?: OrderStatus;
      paymentStatus?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const skip = (page - 1) * limit;
    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('order.driver', 'driver');

    if (filters?.status) {
      queryBuilder.andWhere('order.status = :status', {
        status: filters.status,
      });
    }

    if (filters?.paymentStatus) {
      queryBuilder.andWhere('order.paymentStatus = :paymentStatus', {
        paymentStatus: filters.paymentStatus,
      });
    }

    if (filters?.search) {
      queryBuilder.andWhere(
        '(order.trackingCode ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    if (filters?.startDate && filters?.endDate) {
      queryBuilder.andWhere('order.createdAt BETWEEN :startDate AND :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    }

    // Clone query builder for count (without joins for better performance)
    const countQueryBuilder = this.orderRepository.createQueryBuilder('order');

    if (filters?.status) {
      countQueryBuilder.andWhere('order.status = :status', {
        status: filters.status,
      });
    }

    if (filters?.paymentStatus) {
      countQueryBuilder.andWhere('order.paymentStatus = :paymentStatus', {
        paymentStatus: filters.paymentStatus,
      });
    }

    if (filters?.search) {
      countQueryBuilder
        .leftJoin('order.user', 'user')
        .andWhere(
          '(order.trackingCode ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
          { search: `%${filters.search}%` },
        );
    }

    if (filters?.startDate && filters?.endDate) {
      countQueryBuilder.andWhere(
        'order.createdAt BETWEEN :startDate AND :endDate',
        {
          startDate: filters.startDate,
          endDate: filters.endDate,
        },
      );
    }

    const total = await countQueryBuilder.getCount();

    const data = await queryBuilder
      .orderBy('order.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    return {
      data: data.map((order) => this.serializeOrder(order)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getOrderById(id: string) {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['user', 'driver', 'driver.vehicle', 'driver.profileImage'],
    });
    if (!order) throw new NotFoundException('Order not found');
    return this.serializeOrder(order);
  }

  async updateOrderStatus(id: string, status: OrderStatus) {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['user', 'driver'],
    });
    if (!order) throw new NotFoundException('Order not found');
    order.status = status;
    const saved = await this.orderRepository.save(order);
    return this.serializeOrder(saved);
  }

  async assignOrderToDriver(orderId: string, driverId: string) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['user', 'driver'],
    });
    if (!order) throw new NotFoundException('Order not found');

    const driver = await this.userRepository.findOne({
      where: { id: driverId, role: UserRole.RIDER },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    order.driverId = driverId;
    order.status = OrderStatus.ASSIGNED;
    const saved = await this.orderRepository.save(order);

    // Reload with relations
    const updatedOrder = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['user', 'driver', 'driver.vehicle', 'driver.profileImage'],
    });
    return this.serializeOrder(updatedOrder || saved);
  }

  async cancelOrder(id: string) {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['user', 'driver'],
    });
    if (!order) throw new NotFoundException('Order not found');
    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    const saved = await this.orderRepository.save(order);
    return this.serializeOrder(saved);
  }

  // ========== TRANSACTION MANAGEMENT ==========
  async getAllTransactions(
    page: number = 1,
    limit: number = 20,
    filters?: {
      type?: string;
      status?: string;
      search?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const skip = (page - 1) * limit;
    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.user', 'user')
      .leftJoinAndSelect('transaction.driver', 'driver');

    if (filters?.type) {
      queryBuilder.andWhere('transaction.type = :type', { type: filters.type });
    }

    if (filters?.status) {
      queryBuilder.andWhere('transaction.status = :status', {
        status: filters.status,
      });
    }

    if (filters?.search) {
      queryBuilder.andWhere(
        '(transaction.reference ILIKE :search OR transaction.narration ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    if (filters?.startDate && filters?.endDate) {
      queryBuilder.andWhere(
        'transaction.createdAt BETWEEN :startDate AND :endDate',
        {
          startDate: filters.startDate,
          endDate: filters.endDate,
        },
      );
    }

    // Clone query builder for count (without joins for better performance)
    const countQueryBuilder =
      this.transactionRepository.createQueryBuilder('transaction');

    if (filters?.type) {
      countQueryBuilder.andWhere('transaction.type = :type', {
        type: filters.type,
      });
    }

    if (filters?.status) {
      countQueryBuilder.andWhere('transaction.status = :status', {
        status: filters.status,
      });
    }

    if (filters?.search) {
      countQueryBuilder.andWhere(
        '(transaction.reference ILIKE :search OR transaction.narration ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    if (filters?.startDate && filters?.endDate) {
      countQueryBuilder.andWhere(
        'transaction.createdAt BETWEEN :startDate AND :endDate',
        {
          startDate: filters.startDate,
          endDate: filters.endDate,
        },
      );
    }

    const total = await countQueryBuilder.getCount();

    const data = await queryBuilder
      .orderBy('transaction.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getMany();

    return {
      data: data.map((transaction) => this.serializeTransaction(transaction)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ========== STATISTICS ==========
  async getDashboardStats() {
    const [
      totalUsers,
      totalDrivers,
      totalOrders,
      totalTransactions,
      pendingDrivers,
      activeOrders,
      completedOrders,
      totalRevenue,
    ] = await Promise.all([
      this.userRepository.count({ where: { role: UserRole.USER } }),
      this.userRepository.count({ where: { role: UserRole.RIDER } }),
      this.orderRepository.count(),
      this.transactionRepository.count(),
      this.userRepository.count({
        where: { role: UserRole.RIDER, isApproved: false },
      }),
      this.orderRepository.count({
        where: { status: OrderStatus.NEW },
      }),
      this.orderRepository.count({
        where: { status: OrderStatus.COMPLETED },
      }),
      this.orderRepository
        .createQueryBuilder('order')
        .select('SUM(order.amount)', 'total')
        .where('order.paymentStatus = :status', { status: 'SUCCESSFUL' })
        .getRawOne(),
    ]);

    const recentOrders = await this.orderRepository.find({
      take: 10,
      order: { createdAt: 'DESC' },
      relations: ['user', 'driver'],
    });

    const recentTransactions = await this.transactionRepository.find({
      take: 10,
      order: { createdAt: 'DESC' },
      relations: ['user', 'driver'],
    });

    return {
      overview: {
        totalUsers,
        totalDrivers,
        totalOrders,
        totalTransactions,
        pendingDrivers,
        activeOrders,
        completedOrders,
        totalRevenue: totalRevenue?.total || 0,
      },
      recentOrders: recentOrders.map((order) => this.serializeOrder(order)),
      recentTransactions: recentTransactions.map((transaction) =>
        this.serializeTransaction(transaction),
      ),
    };
  }

  // ========== NOTIFICATION MANAGEMENT ==========
  async sendAdminNotification(dto: SendAdminNotificationDto) {
    const {
      recipientType,
      userIds,
      title,
      body,
      sendEmail = true,
      sendPush = true,
      sendInApp = true,
      type,
      typeId,
      data,
    } = dto;

    // Get target users based on recipient type
    let targetUsers: User[] = [];

    switch (recipientType) {
      case RecipientType.SPECIFIC_USERS:
        if (!userIds || userIds.length === 0) {
          throw new BadRequestException(
            'userIds is required when recipientType is SPECIFIC_USERS',
          );
        }
        targetUsers = await this.userRepository.find({
          where: {
            id: In(userIds),
            role: UserRole.USER,
          },
        });
        break;

      case RecipientType.ALL_USERS:
        targetUsers = await this.userRepository.find({
          where: { role: UserRole.USER },
        });
        break;

      case RecipientType.SPECIFIC_RIDERS:
        if (!userIds || userIds.length === 0) {
          throw new BadRequestException(
            'userIds is required when recipientType is SPECIFIC_RIDERS',
          );
        }
        targetUsers = await this.userRepository.find({
          where: {
            id: In(userIds),
            role: UserRole.RIDER,
          },
        });
        break;

      case RecipientType.ALL_RIDERS:
        targetUsers = await this.userRepository.find({
          where: { role: UserRole.RIDER },
        });
        break;

      default:
        throw new BadRequestException('Invalid recipient type');
    }

    if (targetUsers.length === 0) {
      return {
        success: false,
        message: 'No users found matching the criteria',
        stats: {
          total: 0,
          emailSent: 0,
          pushSent: 0,
          inAppCreated: 0,
          failed: 0,
        },
      };
    }

    // Send notifications to all target users
    const results = {
      emailSent: 0,
      pushSent: 0,
      inAppCreated: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Process notifications in parallel with batching
    const batchSize = 10;
    for (let i = 0; i < targetUsers.length; i += batchSize) {
      const batch = targetUsers.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (user) => {
          try {
            // Send email if enabled
            if (sendEmail && user.email) {
              try {
                await this.mailService.sendEmail(
                  user.email,
                  title,
                  `<div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>${title}</h2>
                    <p>${body.replace(/\n/g, '<br>')}</p>
                    <p style="margin-top: 20px; color: #666; font-size: 12px;">
                      This is an automated message from Errands Platform.
                    </p>
                  </div>`,
                  body,
                );
                results.emailSent++;
              } catch (error) {
                this.logger.error(
                  `Failed to send email to ${user.email}:`,
                  error,
                );
                results.failed++;
                results.errors.push(
                  `Email failed for ${user.email}: ${error.message}`,
                );
              }
            }

            // Send push notification if enabled
            if (sendPush) {
              try {
                await this.notificationService.sendPushNotification(
                  user.id,
                  title,
                  body,
                  {
                    type: type || 'CUSTOM',
                    typeId: typeId || '',
                    ...data,
                  },
                );
                results.pushSent++;
              } catch (error) {
                this.logger.error(
                  `Failed to send push to user ${user.id}:`,
                  error,
                );
                results.failed++;
                results.errors.push(
                  `Push failed for user ${user.id}: ${error.message}`,
                );
              }
            }

            // Create in-app notification if enabled
            if (sendInApp) {
              try {
                const notificationType = type && Object.values(NotificationType).includes(type as any)
                  ? (type as any)
                  : NotificationType.CUSTOM;
                
                await this.notificationService.createInAppNotification(
                  user.id,
                  notificationType,
                  title,
                  body,
                  {
                    type: type || 'CUSTOM',
                    typeId: typeId || '',
                    ...data,
                  },
                );
                results.inAppCreated++;
              } catch (error) {
                this.logger.error(
                  `Failed to create in-app notification for user ${user.id}:`,
                  error,
                );
                results.failed++;
                results.errors.push(
                  `In-app notification failed for user ${user.id}: ${error.message}`,
                );
              }
            }
          } catch (error) {
            this.logger.error(
              `Failed to send notification to user ${user.id}:`,
              error,
            );
            results.failed++;
            results.errors.push(
              `Failed for user ${user.id}: ${error.message}`,
            );
          }
        }),
      );
    }

    return {
      success: true,
      message: `Notifications sent to ${targetUsers.length} users`,
      stats: {
        total: targetUsers.length,
        emailSent: results.emailSent,
        pushSent: results.pushSent,
        inAppCreated: results.inAppCreated,
        failed: results.failed,
      },
      errors: results.errors.length > 0 ? results.errors : undefined,
    };
  }

  // ========== HELPER METHODS ==========
  private sanitizeUser(user: User) {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  private serializeOrder(order: Order): any {
    return {
      id: order.id,
      trackingCode: order.trackingCode,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      amount: order.amount,
      distance: order.distance,
      charge: order.charge,
      vehicle: order.vehicle,
      packageCategory: order.packageCategory,
      deliveryType: order.deliveryType,
      shippingType: order.shippingType,
      pickupLocation: order.pickupLocation,
      deliveryLocation: order.deliveryLocation,
      receiverDetails: order.receiverDetails,
      pickupDetails: order.pickupDetails,
      instruction: order.instruction,
      description: order.description,
      packageSize: order.packageSize,
      images: order.images,
      userId: order.userId,
      driverId: order.driverId,
      eta: order.eta,
      pickupTime: order.pickupTime,
      deliveryTime: order.deliveryTime,
      acceptTime: order.acceptTime,
      startTime: order.startTime,
      completeTime: order.completeTime,
      cancelTime: order.cancelTime,
      cancelledAt: order.cancelledAt,
      paymentReference: order.paymentReference,
      paidAt: order.paidAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      user: order.user
        ? {
            id: order.user.id,
            firstName: order.user.firstName,
            lastName: order.user.lastName,
            email: order.user.email,
            phoneNumber: order.user.phoneNumber,
          }
        : null,
      driver: order.driver
        ? {
            id: order.driver.id,
            firstName: order.driver.firstName,
            lastName: order.driver.lastName,
            email: order.driver.email,
            phoneNumber: order.driver.phoneNumber,
            vehicle: order.driver.vehicle
              ? {
                  id: order.driver.vehicle.id,
                  vehicleType: order.driver.vehicle.vehicleType,
                  vehicleBrand: order.driver.vehicle.vehicleBrand,
                  licensePlate: order.driver.vehicle.licensePlate,
                }
              : null,
            profileImage: order.driver.profileImage
              ? {
                  url: order.driver.profileImage.url,
                }
              : null,
          }
        : null,
    };
  }

  private serializeTransaction(transaction: Transaction): any {
    return {
      id: transaction.id,
      type: transaction.type,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      narration: transaction.narration,
      orderId: transaction.orderId,
      reference: transaction.reference,
      isVerified: transaction.isVerified,
      verifiedAt: transaction.verifiedAt,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
      user: transaction.user
        ? {
            id: transaction.user.id,
            firstName: transaction.user.firstName,
            lastName: transaction.user.lastName,
            email: transaction.user.email,
            phoneNumber: transaction.user.phoneNumber,
            role: transaction.user.role,
          }
        : null,
      driver: transaction.driver
        ? {
            id: transaction.driver.id,
            firstName: transaction.driver.firstName,
            lastName: transaction.driver.lastName,
            email: transaction.driver.email,
            phoneNumber: transaction.driver.phoneNumber,
            role: transaction.driver.role,
          }
        : null,
    };
  }
}
