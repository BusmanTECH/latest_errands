import {
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './entities/order.entity';
import { OrderSetting } from './entities/order-setting.entity';
import { Location } from './entities/location.entity';
import { User } from '../auth/entities/user.entity';
// Simple OTP/reference generator
const generateOTP = (
  length: number = 6,
  digitsOnly: boolean = false,
): string => {
  const chars = digitsOnly
    ? '0123456789'
    : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};
// Mailer service - commented out until service is available
// import { Mailer } from 'src/modules/services/mailer.service';
// import TrackingMail from 'src/modules/services/mailers/templates/tracking-mail';
// import NewOrderDriverMail from 'src/modules/services/mailers/templates/new-order-driver-mail';
// import OrderAcceptedMail from 'src/modules/services/mailers/templates/order-accepted-mail';
// import OrderStartedMail from 'src/modules/services/mailers/templates/order-started-mail';
// import OrderCompletedMail from 'src/modules/services/mailers/templates/order-completed-mail';
import { PaystackService } from '../services/paystack.service';
import { PaymentService } from '../payment/payment.service';
import {
  PaymentTransactionType,
  PaymentTransactionStatus,
} from '../payment/entities/payment-transaction.entity';
import { WalletService } from '../wallet/wallet.service';
import { DriverService } from '../driver/driver.service';
import { TrafficWeatherService } from './trafficWeather.service';
import { TransactionService } from '../transaction/transaction.service';
import {
  TransactionType,
  TransactionStatus,
} from '../transaction/entities/transaction.entity';
import { MailService } from '../mail/mail.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/entities/notification.entity';

import axios from 'axios';
import { Server } from 'socket.io';
import { ReceiptService } from 'src/receipt/receipt.service';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order)
    public readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderSetting)
    private readonly orderSettingRepo: Repository<OrderSetting>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    // private mailerService: Mailer,
    private paystackService: PaystackService,
    private paymentService: PaymentService,
    private walletService: WalletService,
    private driverService: DriverService,
    private trafficWeatherService: TrafficWeatherService,
    private transactionService: TransactionService,
    private mailService: MailService,
    private notificationService: NotificationService,
    private receiptService: ReceiptService,
  ) {}

  async createOrder(payload: any) {
    if (!payload.pickupCoordinates || !payload.deliveryCoordinates) {
      throw new BadRequestException(
        'Pickup and delivery coordinates are required',
      );
    }
    if (!payload.pickupLocation || !payload.deliveryLocation) {
      throw new BadRequestException(
        'Pickup and delivery location are required',
      );
    }
    if (!payload.receiverDetails || !payload.pickupDetails) {
      throw new BadRequestException(
        'Receiver details and pickup details are required',
      );
    }
    if (!payload.vehicle) {
      throw new BadRequestException('Vehicle is required');
    }
    if (!payload.packageCategory) {
      throw new BadRequestException('Package category is required');
    }
    if (!payload.deliveryType) {
      throw new BadRequestException('Delivery type is required');
    }
    if (payload.deliveryType === 'schedule' && !payload.scheduledPickupTime) {
      throw new BadRequestException(
        'Scheduled pickup time is required for schedule delivery',
      );
    }
    if (
      payload.deliveryLocation.coordinate.lat ===
        payload.pickupLocation.coordinate.lat &&
      payload.deliveryLocation.coordinate.lng ===
        payload.pickupLocation.coordinate.lng
    ) {
      throw new BadRequestException(
        'Delivery location cannot be the same as pickup location',
      );
    }

    const trackingCode = `TRC-${generateOTP(6, false)}`;

    // Convert coordinates to PostGIS format: POINT(longitude latitude)
    const pickupCoords = payload.pickupCoordinates?.coordinates || [
      payload.pickupLocation?.coordinate?.lng,
      payload.pickupLocation?.coordinate?.lat,
    ];
    const deliveryCoords = payload.deliveryCoordinates?.coordinates || [
      payload.deliveryLocation?.coordinate?.lng,
      payload.deliveryLocation?.coordinate?.lat,
    ];

    // Convert coordinates array to PostGIS POINT string format
    const pickupPoint =
      pickupCoords && pickupCoords.length === 2
        ? `POINT(${pickupCoords[0]} ${pickupCoords[1]})`
        : null;
    const deliveryPoint =
      deliveryCoords && deliveryCoords.length === 2
        ? `POINT(${deliveryCoords[0]} ${deliveryCoords[1]})`
        : null;

    // Get userId from payload (extract before spreading to avoid circular refs)
    const userId = payload.user?.id || payload.user?.sub || payload.user?._id;

    // Remove user object from payload to avoid circular JSON structure
    const { user, ...orderPayload } = payload;

    // Create order first to get order ID, then process payment
    const orderData = this.orderRepo.create({
      ...orderPayload,
      trackingCode,
      paymentStatus: 'PENDING' as any, // Will be updated after payment processing
      pickupCoordinates: pickupPoint,
      deliveryCoordinates: deliveryPoint,
      userId: userId?.toString(),
    });

    let newOrder = (await this.orderRepo.save(orderData)) as unknown as Order;

    let paymentReference: string | undefined;
    let paymentStatus = 'PENDING';

    // Handle payment based on payment method
    if (payload.paymentMethod === 'card') {
      // Validate and charge card immediately
      const userId = payload.user?.id || payload.user?.sub || payload.user?._id;
      if (!userId) {
        // Delete the created order if payment fails
        await this.orderRepo.delete(newOrder.id);
        throw new BadRequestException('User ID is required for card payment');
      }

      try {
        const paymentResult = await this.paymentService.chargeCardForOrder(
          userId.toString(),
          payload.amount,
          newOrder.id,
        );
        paymentReference = paymentResult.reference;
        paymentStatus = 'SUCCESSFUL';

        // Update order with payment status and reference
        newOrder.paymentStatus = paymentStatus as any;
        newOrder.paymentReference = paymentReference;
        newOrder = await this.orderRepo.save(newOrder);
      } catch (error) {
        // Delete the created order if payment fails
        await this.orderRepo.delete(newOrder.id);
        throw new HttpException(
          error.message || 'Failed to process card payment',
          HttpStatus.BAD_REQUEST,
        );
      }
    } else if (payload.paymentMethod === 'wallet') {
      // Wallet payment: debit immediately
      // Note: Wallet is currently only for RIDER role, so this might need adjustment
      const userId = payload.user?.id || payload.user?.sub || payload.user?._id;
      if (!userId) {
        await this.orderRepo.delete(newOrder.id);
        throw new BadRequestException('User ID is required for wallet payment');
      }

      try {
        // Check wallet balance (only works for RIDER role currently)
        const walletBalance = await this.walletService.getWalletBalance(
          userId.toString(),
        );
        if (walletBalance < payload.amount) {
          await this.orderRepo.delete(newOrder.id);
          throw new HttpException(
            'Insufficient wallet balance',
            HttpStatus.BAD_REQUEST,
          );
        }

        // Debit wallet
        await this.walletService.debitWallet(
          userId.toString(),
          payload.amount,
          'Order payment via wallet',
        );

        const reference = `WAL-${generateOTP(12, false)}`;

        // Create PaymentTransaction for payment tracking
        await this.paymentService.createTransaction({
          user: userId.toString(),
          amount: payload.amount,
          reference: reference,
          orderId: newOrder.id,
          narration: 'Order payment via wallet',
          type: 'debit' as any,
          status: 'SUCCESSFUL' as any,
          isVerified: true,
          verifiedAt: new Date(),
        });

        // Create Transaction record for transaction history
        await this.transactionService.createTransaction({
          userId: userId.toString(),
          orderId: newOrder.id,
          type: TransactionType.DEBIT,
          amount: payload.amount,
          currency: 'NGN',
          narration: 'Order payment via wallet',
          status: TransactionStatus.SUCCESSFUL,
          reference: reference,
        });

        paymentReference = reference;
        paymentStatus = 'SUCCESSFUL';

        // Update order with payment status
        newOrder.paymentStatus = paymentStatus as any;
        newOrder.paymentReference = paymentReference;
        newOrder = await this.orderRepo.save(newOrder);
      } catch (error) {
        await this.orderRepo.delete(newOrder.id);
        throw new HttpException(
          error.message || 'Failed to process wallet payment',
          HttpStatus.BAD_REQUEST,
        );
      }
    } else if (payload.paymentMethod === 'cash') {
      // Cash payment: status remains PENDING until driver accepts and commission is deducted
      paymentStatus = 'PENDING';
      // Order already created with PENDING status, no update needed
    } else {
      await this.orderRepo.delete(newOrder.id);
      throw new BadRequestException(
        'Invalid payment method. Must be card, wallet, or cash',
      );
    }

    if (payload.saveLocation) {
      const locationData = this.locationRepo.create({
        pickupLocation: payload.pickupLocation,
        deliveryLocation: payload.deliveryLocation,
        receiverDetails: payload.receiverDetails,
        pickupDetails: payload.pickupDetails,
        userId: userId?.toString(),
      });
      await this.locationRepo.save(locationData);
    }

    const drivers = await this.userRepo.find({
      where: {
        role: 'rider' as any,
        isApproved: true,
        isOnline: true,
      },
    });

    // Return order data without relations to avoid circular JSON structure
    const orderResponse = {
      id: newOrder.id,
      trackingCode: newOrder.trackingCode,
      status: newOrder.status,
      paymentStatus: newOrder.paymentStatus,
      paymentMethod: newOrder.paymentMethod,
      paymentReference: newOrder.paymentReference,
      scope: (newOrder as any).scope,
      vehicle: newOrder.vehicle,
      packageCategory: newOrder.packageCategory,
      pickupLocation: newOrder.pickupLocation,
      deliveryLocation: newOrder.deliveryLocation,
      closeLandmark: newOrder.closeLandmark,
      deliveryType: newOrder.deliveryType,
      shippingType: newOrder.shippingType,
      scheduledPickupTime: newOrder.scheduledPickupTime,
      receiverDetails: newOrder.receiverDetails,
      pickupDetails: newOrder.pickupDetails,
      instruction: newOrder.instruction,
      parishableHandling: newOrder.parishableHandling,
      description: newOrder.description,
      packageSize: newOrder.packageSize,
      images: newOrder.images,
      amount: newOrder.amount,
      distance: newOrder.distance,
      charge: newOrder.charge,
      eta: newOrder.eta,
      userId: newOrder.userId,
      driverId: newOrder.driverId,
      createdAt: newOrder.createdAt,
      updatedAt: newOrder.updatedAt,
    };

    // Send order created email to user
    try {
      const orderUser = await this.userRepo.findOne({
        where: { id: userId?.toString() },
      });
      if (orderUser) {
        // Reload order with relations for email
        const orderForEmail = await this.orderRepo.findOne({
          where: { id: newOrder.id },
          relations: ['user'],
        });
        if (orderForEmail) {
          await this.mailService.sendOrderCreatedEmail(
            orderForEmail,
            orderUser,
          );
          // Send push and in-app notification
          await this.notificationService.sendOrderNotification(
            userId?.toString(),
            NotificationType.ORDER_CREATED,
            orderForEmail,
          );
        }
      }
    } catch (emailError) {
      console.error('Error sending order created email:', emailError);
      // Don't fail order creation if email fails
    }

    return {
      success: true,
      message: 'New order placed successfully',
      data: orderResponse,
    };
  }

  async sendOrderStatusNotification(order: any, payload: any) {
    const status = payload.status;
    const userId = order.user;

    let title = '';
    let message = '';
    let type = 'order_updated';

    switch (status) {
      case 'driver_assigned':
        title = 'Driver Assigned to Your Order';
        message = `A driver has been assigned to your order with tracking code ${order.trackingCode}. You'll be notified when they start heading to the pickup location.`;
        type = 'driver_assigned';
        break;

      case 'driver_en_route':
        title = 'Driver En Route to Pickup';
        message = `Your driver is on the way to the pickup location for order ${order.trackingCode}. Please ensure someone is available to hand over the package.`;
        type = 'driver_en_route';
        break;

      case 'order_picked':
        title = 'Order Picked Up Successfully';
        message = `Your order with tracking code ${order.trackingCode} has been picked up and is now on its way to the delivery location.`;
        type = 'order_picked';
        break;

      case 'driver_en_route_delivery':
        title = 'Driver En Route to Delivery';
        message = `Your driver is on the way to the delivery location for order ${order.trackingCode}. Please ensure someone is available to receive the package.`;
        type = 'driver_en_route_delivery';
        break;

      case 'delivered':
        title = 'Order Delivered Successfully';
        message = `Your order with tracking code ${order.trackingCode} has been delivered successfully. Thank you for using our service!`;
        type = 'order_delivered';
        break;

      case 'cancelled':
        title = 'Order Cancelled';
        message = `Your order with tracking code ${order.trackingCode} has been cancelled. If you have any questions, please contact our support team.`;
        type = 'order_cancelled';
        break;

      case 'completed':
        title = 'Order Completed';
        message = `Your order with tracking code ${order.trackingCode} has been completed successfully. We hope you had a great experience!`;
        type = 'order_completed';
        break;

      default:
        // For other status updates, send a generic notification
        if (status !== order.status) {
          title = 'Order Status Updated';
          message = `Your order with tracking code ${order.trackingCode} status has been updated to: ${status}`;
          type = 'order_status_updated';
        }
        break;
    }

    // Only send notification if we have a title and message
    // TODO: Re-enable when notification service is available
    // if (title && message) {
    //   await this.notificationService.sendMessage({
    //     user: userId,
    //     title,
    //     message,
    //     type,
    //     typeId: order.id,
    //   });
    // }
  }

  async calculateCost(payload: any) {
    try {
      const orderSettings = await this.getOrCreateOrderSettings();

      const costPerKm = orderSettings.costPerKm;
      const minCost = orderSettings.minCost;
      const deliveryTypePricing =
        orderSettings.deliveryTypePricing || ({} as any);

      const distancematrix = await this.calculateDistance({
        pickupCoordinates: payload.pickupCoordinates,
        deliveryCoordinates: payload.deliveryCoordinates,
      });
      const distance = parseFloat(
        (distancematrix.rows[0].elements[0].distance.value / 1000).toFixed(2),
      );
      const eta = parseFloat(
        (distancematrix.rows[0].elements[0].duration.value / 60).toFixed(2),
      );

      const normalizedTypeRaw = (payload.deliveryType || 'instant')
        .toString()
        .toLowerCase();
      const normalizedDeliveryType =
        normalizedTypeRaw === 'schedule' ? 'schedule' : 'instant';

      const perKmConfig = (orderSettings as any).perKmPricing || {};
      const perKm =
        typeof perKmConfig.normal === 'number' ? perKmConfig.normal : costPerKm;

      const calculatedCost = distance * perKm;
      const baseCost = Math.ceil(Math.max(minCost, calculatedCost));

      const surcharges = (orderSettings as any).surcharges || {};

      let deliveryTypeCost = 0;
      const typeCost = deliveryTypePricing[normalizedDeliveryType];
      if (typeof typeCost === 'number' && typeCost > 0) {
        deliveryTypeCost = typeCost;
      }

      let weatherTrafficSurcharge = 0;
      if (payload.weather === 'rain') {
        weatherTrafficSurcharge += Math.ceil(
          distance * (surcharges.rainPerKm || 0),
        );
      }
      if (payload.traffic === 'heavy') {
        weatherTrafficSurcharge += Math.ceil(
          distance * (surcharges.trafficPerKm || 0),
        );
      }

      // Add perishable surcharge if package category is perishable
      let perishableSurcharge = 0;
      if (payload.packageCategory === 'perishable') {
        perishableSurcharge = 1000;
      }

      let totalCost =
        baseCost +
        deliveryTypeCost +
        weatherTrafficSurcharge +
        perishableSurcharge;

      return {
        success: true,
        message: 'Cost of fleet calculated successfully',
        data: {
          distance,
          eta,
          cost: totalCost,
          baseCost,
          perKm,
          deliveryTypeCost,
          weatherTrafficSurcharge,
          perishableSurcharge:
            perishableSurcharge > 0 ? perishableSurcharge : undefined,
          deliveryType: normalizedDeliveryType,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to calculate cost check coordinates and delivery type',
        error: error.message,
      };
    }
  }

  async myOrders(user, status?: string) {
    const userId = user.id || user.sub || user._id;
    const whereClause: any = { userId: userId?.toString() };
    if (user?.role === 'rider') {
      throw new BadRequestException(
        'You are not authorized to access this resource',
      );
    }
    if (status && status.trim() !== '') {
      whereClause.status = status.trim();
    }

    const orders = await this.orderRepo.find({
      where: whereClause,
      relations: [
        'user',
        'user.profileImage',
        'driver',
        'driver.vehicle',
        'driver.profileImage',
      ],
      order: { createdAt: 'DESC' },
    });

    // Serialize orders to include vehicle info and avoid circular references
    const serializedOrders = orders.map((order) => this.serializeOrder(order));

    return {
      success: true,
      message: 'Orders fetch successfully',
      data: serializedOrders,
    };
  }

  async allOrders(page: number, filters: any) {
    const limit: number = 20;
    const skip = ((page > 1 ? page : 1) - 1) * limit;

    const sanitizedFilters = Object.entries(filters || {}).reduce(
      (acc, [key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, any>,
    );

    const searchKeyword = sanitizedFilters.search;
    delete sanitizedFilters.search;

    // Build search query if keyword exists
    let query: any = { ...sanitizedFilters };

    if (searchKeyword) {
      query.$or = [
        { trackingCode: { $regex: searchKeyword, $options: 'i' } },
        { status: { $regex: searchKeyword, $options: 'i' } },
        { paymentStatus: { $regex: searchKeyword, $options: 'i' } },
        { paymentMethod: { $regex: searchKeyword, $options: 'i' } },
        // Add more fields as needed
      ];
    }

    // Convert MongoDB query to TypeORM where clause
    const whereClause: any = {};
    Object.keys(query).forEach((key) => {
      if (
        key !== '$or' &&
        query[key] !== undefined &&
        query[key] !== null &&
        query[key] !== ''
      ) {
        whereClause[key] = query[key];
      }
    });

    // Handle $or queries (search functionality)
    let searchCondition = null;
    if (query.$or && Array.isArray(query.$or)) {
      searchCondition = query.$or.map((condition: any) => {
        const field = Object.keys(condition)[0];
        const regex = condition[field]?.$regex;
        if (regex) {
          return { [field]: { $ilike: `%${regex}%` } };
        }
        return condition;
      });
    }

    const queryBuilder = this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('user.profileImage', 'userProfileImage')
      .leftJoinAndSelect('order.driver', 'driver')
      .leftJoinAndSelect('driver.vehicle', 'driverVehicle')
      .leftJoinAndSelect('driver.profileImage', 'driverProfileImage')
      .orderBy('order.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    // Apply filters
    if (Object.keys(whereClause).length > 0) {
      Object.keys(whereClause).forEach((key, index) => {
        if (index === 0) {
          queryBuilder.where(`order.${key} = :${key}`, {
            [key]: whereClause[key],
          });
        } else {
          queryBuilder.andWhere(`order.${key} = :${key}`, {
            [key]: whereClause[key],
          });
        }
      });
    }

    // Apply search conditions
    if (searchCondition) {
      const searchKeys = Object.keys(searchCondition[0] || {});
      if (searchKeys.length > 0) {
        const searchKey = searchKeys[0];
        const searchValue = query.$or[0][searchKey]?.$regex || searchKeyword;
        queryBuilder.orWhere(`order.${searchKey} ILIKE :search`, {
          search: `%${searchValue}%`,
        });
      }
    }

    const orders = await queryBuilder.getMany();
    const totalOrders = await queryBuilder.getCount();

    // Serialize orders to include vehicle and profile image info
    const serializedOrders = orders.map((order) => this.serializeOrder(order));

    return {
      success: true,
      message: 'Orders fetched successfully',
      data: serializedOrders,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
      },
    };
  }

  async driverOrders(driverId, status?: string) {
    const whereClause: any = { driverId: driverId?.toString() };

    // Only add status filter if status is provided and not empty
    if (status && status.trim() !== '') {
      whereClause.status = status.trim();
    }

    const orders = await this.orderRepo.find({
      where: whereClause,
      relations: [
        'user',
        'user.profileImage',
        'driver',
        'driver.vehicle',
        'driver.profileImage',
      ],
      order: { createdAt: 'DESC' },
    });

    // Serialize orders to include vehicle and profile image info
    const serializedOrders = orders.map((order) => this.serializeOrder(order));

    return {
      success: true,
      message: 'Orders fetch successfully',
      data: serializedOrders,
    };
  }

  async myDriverOrders(user, status?: string) {
    const userId = user.id || user.sub || user._id;
    if (user?.role === 'user') {
      throw new BadRequestException(
        'You are not authorized to access this resource',
      );
    }
    return this.driverOrders(userId?.toString(), status);
  }

  async userOrders(userId) {
    const orders = await this.orderRepo.find({
      where: { userId: userId?.toString() },
      relations: [
        'user',
        'user.profileImage',
        'driver',
        'driver.vehicle',
        'driver.profileImage',
      ],
      order: { createdAt: 'DESC' },
    });

    // Serialize orders to include vehicle info and avoid circular references
    const serializedOrders = orders.map((order) => this.serializeOrder(order));

    return {
      success: true,
      message: 'User orders fetch successfully',
      data: serializedOrders,
    };
  }

  async saveLocation(payload) {
    const locationData = this.locationRepo.create(payload);
    const location = await this.locationRepo.save(locationData);
    return {
      success: true,
      message: 'Location saved successfully',
      data: location,
    };
  }

  async fetchMyLocation(userId) {
    const locations = await this.locationRepo.find({
      where: { userId: userId?.toString() },
    });
    return {
      success: true,
      message: 'Location fetch successfully',
      data: locations,
    };
  }

  async findAllOrderSettings(): Promise<OrderSetting[]> {
    return await this.orderSettingRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  // Helper method to sanitize deliveryTypePricing to only include instant and schedule
  private sanitizeDeliveryTypePricing(pricing: any): {
    instant: number;
    schedule: number;
  } {
    const sanitized: { instant?: number; schedule?: number } = {};

    // Only keep instant and schedule, remove all other properties
    if (pricing && typeof pricing === 'object') {
      if (typeof pricing.instant === 'number') {
        sanitized.instant = pricing.instant;
      }
      if (typeof pricing.schedule === 'number') {
        sanitized.schedule = pricing.schedule;
      }
    }

    // Set defaults if missing
    if (!sanitized.instant || sanitized.instant === 0) {
      sanitized.instant = 1000;
    }
    if (!sanitized.schedule || sanitized.schedule === 0) {
      sanitized.schedule = 800; // Cheaper than instant
    }

    return sanitized as { instant: number; schedule: number };
  }

  // Helper method to get or create default order settings
  private async getOrCreateOrderSettings(): Promise<OrderSetting> {
    let settings = await this.orderSettingRepo.findOne({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });

    if (!settings) {
      // Create default settings if none exist
      const defaultSettings = this.orderSettingRepo.create({
        name: 'general',
        costPerKm: 180,
        minCost: 1000,
        maxCost: 50000,
        distanceRang: 10,
        orderPercentage: 10,
        limitAmount: -1000,
        isActive: true,
        deliveryTypePricing: {
          instant: 1000,
          schedule: 800, // Schedule is cheaper than instant
        },
        perKmPricing: {
          express: 250,
          normal: 180,
        },
        surcharges: {
          rainPerKm: 50,
          trafficPerKm: 50,
        },
      });

      settings = (await this.orderSettingRepo.save(
        defaultSettings,
      )) as unknown as OrderSetting;
    } else {
      // Sanitize existing settings to remove old delivery types
      const originalPricing = settings.deliveryTypePricing;
      const sanitizedPricing =
        this.sanitizeDeliveryTypePricing(originalPricing);

      // Only update if the pricing was actually changed (had old properties)
      const needsUpdate =
        originalPricing &&
        (originalPricing.hasOwnProperty('express') ||
          originalPricing.hasOwnProperty('standard') ||
          originalPricing.hasOwnProperty('regular') ||
          originalPricing.hasOwnProperty('sameday') ||
          JSON.stringify(originalPricing) !== JSON.stringify(sanitizedPricing));

      if (needsUpdate) {
        settings.deliveryTypePricing = sanitizedPricing as any;
        settings = await this.orderSettingRepo.save(settings);
      }
    }

    return settings;
  }

  async getCurrentOrderSettings() {
    const settings = await this.getOrCreateOrderSettings();

    // Settings are already sanitized by getOrCreateOrderSettings
    return {
      success: true,
      message: 'Current pricing settings fetched successfully',
      data: settings,
    };
  }

  async updateCurrentOrderSettings(updateData: any) {
    let settings = await this.orderSettingRepo.findOne({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });

    if (!settings) {
      // Create new settings if none exist
      // Ensure required fields have defaults if not provided
      const newSettingsData = {
        name: 'general',
        costPerKm: 180,
        minCost: 1000,
        maxCost: 50000,
        distanceRang: 10,
        orderPercentage: 10,
        limitAmount: -1000,
        isActive: true,
        deliveryTypePricing: {
          instant: 1000,
          schedule: 800, // Schedule is cheaper than instant
        },
        perKmPricing: {
          express: 250,
          normal: 180,
        },
        surcharges: {
          rainPerKm: 50,
          trafficPerKm: 50,
        },
        ...updateData,
      };
      const newSettings = this.orderSettingRepo.create(newSettingsData);
      settings = (await this.orderSettingRepo.save(
        newSettings,
      )) as unknown as OrderSetting;
    } else {
      // Update existing settings
      Object.assign(settings, updateData);

      // Sanitize deliveryTypePricing if it was provided in updateData
      if (updateData.deliveryTypePricing || settings.deliveryTypePricing) {
        const pricingToSanitize =
          updateData.deliveryTypePricing || settings.deliveryTypePricing;
        settings.deliveryTypePricing = this.sanitizeDeliveryTypePricing(
          pricingToSanitize,
        ) as any;
      }

      settings = await this.orderSettingRepo.save(settings);
    }

    return {
      success: true,
      message: 'Pricing settings updated successfully',
      data: settings,
    };
  }

  async findOne(id: string) {
    try {
      return await this.orderRepo.findOne({
        where: { id },
        relations: [
          'user',
          'user.profileImage',
          'driver',
          'driver.vehicle',
          'driver.profileImage',
        ],
      });
    } catch (error) {
      return error;
    }
  }

  async findOrderByTrackCode(payload: string) {
    try {
      const order = await this.orderRepo.findOne({
        where: { trackingCode: payload },
        relations: [
          'user',
          'user.profileImage',
          'driver',
          'driver.vehicle',
          'driver.profileImage',
        ],
      });

      if (!order) {
        return {
          success: false,
          message: 'Order not found',
          data: null,
        };
      }

      // Serialize order to include vehicle and profile image info
      const serializedOrder = this.serializeOrder(order);

      return {
        success: true,
        message: 'Order fetch successfully',
        data: serializedOrder,
      };
    } catch (error) {
      return error;
    }
  }

  async updateOrder(id: string, payload: any) {
    const existingOrder = await this.orderRepo.findOne({
      where: { id },
    });
    if (!existingOrder) {
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }

    if (
      payload.status &&
      payload.status !== 'cancelled' &&
      existingOrder.paymentMethod !== 'cash'
    ) {
      if (existingOrder.paymentStatus !== 'SUCCESSFUL') {
        throw new HttpException(
          'Order cannot be processed until payment is completed',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Update order fields
    Object.assign(existingOrder, payload);
    const updatedOrder = await this.orderRepo.save(existingOrder);

    // Reload with relations including driver vehicle and profile image
    const orderWithRelations = await this.orderRepo.findOne({
      where: { id: updatedOrder.id },
      relations: [
        'user',
        'user.profileImage',
        'driver',
        'driver.vehicle',
        'driver.profileImage',
      ],
    });

    // If order is being completed, increment counters and handle wallet operations
    if (payload.status === 'completed' && orderWithRelations) {
      try {
        if (orderWithRelations.userId) {
          await this.userRepo.increment(
            { id: orderWithRelations.userId },
            'deliveriesCount',
            1,
          );
        }

        if (orderWithRelations.driverId) {
          const driver = await this.userRepo.findOne({
            where: { id: orderWithRelations.driverId, role: 'rider' as any },
          });
          if (driver) {
            driver.deliveriesCount = (driver.deliveriesCount || 0) + 1;
            await this.userRepo.save(driver);
          }
        }

        // Handle order completion wallet operations
        await this.handleOrderCompletion(orderWithRelations);

        // Generate and send receipt automatically
        try {
          await this.generateAndSendReceipt(orderWithRelations);
        } catch (receiptError) {
          console.error('Error generating receipt:', receiptError);
          // Don't throw error to avoid breaking the order completion
        }
      } catch (error) {
        console.error('Error handling order completion:', error);
        // Don't throw error to avoid breaking the order completion
      }
    }

    if (orderWithRelations && orderWithRelations.userId) {
      try {
        await this.sendOrderStatusNotification(orderWithRelations, payload);
      } catch (error) {
        console.error('Error sending order status notification:', error);
      }
    }

    // Serialize order to avoid circular references before returning
    return orderWithRelations
      ? this.serializeOrder(orderWithRelations)
      : updatedOrder;
  }

  // Serialize order to avoid circular references
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
            profileImage: order.user.profileImage
              ? {
                  url: order.user.profileImage.url,
                }
              : null,
          }
        : null,
      driver: order.driver
        ? {
            id: order.driver.id,
            firstName: order.driver.firstName,
            lastName: order.driver.lastName,
            email: order.driver.email,
            phoneNumber: order.driver.phoneNumber,
            averageRating: order.driver.averageRating,
            vehicle: order.driver.vehicle
              ? {
                  id: order.driver.vehicle.id,
                  vehicleType: order.driver.vehicle.vehicleType,
                  vehicleBrand: order.driver.vehicle.vehicleBrand,
                  vehicleYear: order.driver.vehicle.vehicleYear,
                  vehicleColor: order.driver.vehicle.vehicleColor,
                  licensePlate: order.driver.vehicle.licensePlate,
                  vehicleCapacity: order.driver.vehicle.vehicleCapacity,
                  unit: order.driver.vehicle.unit,
                  specialEquipment: order.driver.vehicle.specialEquipment,
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

  async handleOrderCompletion(order: any) {
    try {
      console.log('[ORDER_COMPLETION] Starting handleOrderCompletion', {
        orderId: order?.id,
        driverId: order?.driverId,
        paymentMethod: order?.paymentMethod,
      });

      // Get order settings to calculate percentage
      const orderSettings = await this.getOrCreateOrderSettings();
      const orderPercentage = orderSettings.orderPercentage || 10; // Default 10%

      // Calculate percentage amount (ensure numeric conversion)
      const orderAmountNum = Number(order.amount);
      const percentageAmount = (orderAmountNum * orderPercentage) / 100;

      // Extract driverId - handle both direct property and relation
      let driverId: string | undefined;
      if (order.driverId) {
        driverId = order.driverId.toString();
      } else if (order.driver) {
        if (typeof order.driver === 'object' && order.driver !== null) {
          driverId =
            (order.driver as any).id?.toString() ||
            (order.driver as any)._id?.toString();
        } else {
          driverId = order.driver.toString();
        }
      }

      if (!driverId) {
        console.error(
          '[ORDER_COMPLETION] No driverId found in order:',
          order.id,
        );
        return; // No driver assigned, skip processing
      }

      console.log('[ORDER_COMPLETION] Driver ID extracted:', driverId);

      // Get driver to verify
      const driver = await this.userRepo.findOne({
        where: { id: driverId, role: 'rider' as any },
      });

      if (!driver || !driver.id) {
        console.error('[ORDER_COMPLETION] Driver not found:', driverId);
        return; // Driver not found, skip processing
      }

      const finalDriverId = driver.id.toString();
      const orderId = order.id.toString();

      console.log('[ORDER_COMPLETION] Processing transactions', {
        finalDriverId,
        orderId,
        paymentMethod: order.paymentMethod,
        amount: orderAmountNum,
        commission: percentageAmount,
      });

      // Generate transaction reference for commission
      const commissionReference = `TXN-COMM-${generateOTP(12, false)}-${Date.now()}`;

      // For cash payments: Commission was already deducted on acceptance, but create transaction record for tracking
      // For card/wallet payments: Deduct commission now and create transaction, then fund rider
      if (order.paymentMethod === 'cash') {
        // Commission was already deducted on acceptance, create transaction record for visibility
        try {
          await this.transactionService.createTransaction({
            driverId: finalDriverId,
            orderId: orderId,
            type: TransactionType.DEBIT,
            amount: percentageAmount,
            currency: 'NGN',
            narration: `Platform commission deduction for order (cash payment)`,
            status: TransactionStatus.SUCCESSFUL,
            reference: commissionReference,
          });
          console.log(
            '[ORDER_COMPLETION] Commission transaction created for cash payment',
          );
        } catch (error) {
          console.error(
            '[ORDER_COMPLETION] Error creating commission transaction for cash:',
            error,
          );
        }
        // No funding for cash payments
        return;
      } else {
        // For card/wallet payments: Deduct commission now
        try {
          await this.walletService.debitWallet(
            finalDriverId,
            percentageAmount,
            'Platform fee deduction',
          );
          console.log(
            '[ORDER_COMPLETION] Commission deducted from driver wallet',
          );

          // Create commission deduction transaction
          await this.transactionService.createTransaction({
            driverId: finalDriverId,
            orderId: orderId,
            type: TransactionType.DEBIT,
            amount: percentageAmount,
            currency: 'NGN',
            narration: `Platform commission deduction for order`,
            status: TransactionStatus.SUCCESSFUL,
            reference: commissionReference,
          });
          console.log('[ORDER_COMPLETION] Commission transaction created');
        } catch (error) {
          console.error(
            '[ORDER_COMPLETION] Error processing commission:',
            error,
          );
          throw error; // Re-throw to prevent funding if commission fails
        }

        // Fund rider: credit wallet with amount minus commission
        const riderAmount = orderAmountNum - percentageAmount;

        try {
          // Credit rider wallet
          await this.walletService.creditWallet(
            finalDriverId,
            riderAmount,
            'Order payment earnings',
          );
          console.log('[ORDER_COMPLETION] Rider wallet credited:', riderAmount);

          // Generate transaction reference for rider funding
          const fundingReference = `TXN-EARN-${generateOTP(12, false)}-${Date.now()}`;

          // Create rider funding transaction
          await this.transactionService.createTransaction({
            driverId: finalDriverId,
            orderId: orderId,
            type: TransactionType.CREDIT,
            amount: riderAmount,
            currency: 'NGN',
            narration: `Order payment earnings for order ${orderId}`,
            status: TransactionStatus.SUCCESSFUL,
            reference: fundingReference,
          });
          console.log('[ORDER_COMPLETION] Rider funding transaction created');
        } catch (error) {
          console.error(
            '[ORDER_COMPLETION] Error processing rider funding:',
            error,
          );
          throw error;
        }
      }
    } catch (error) {
      console.error(
        '[ORDER_COMPLETION] Error handling order completion:',
        error,
      );
      console.error('[ORDER_COMPLETION] Error stack:', error.stack);
      // Don't throw error to avoid breaking the order update
    }
  }

  // async updateOrder(id: string, payload: any) {
  //     return await this.orderModel.findByIdAndUpdate(
  //         id,
  //         payload,
  //         { new: true }
  //     ).exec();
  // }

  async updateOrderSettings(
    id: string,
    orderSetting: any,
  ): Promise<OrderSetting> {
    const existing = await this.orderSettingRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Order setting not found');
    }
    Object.assign(existing, orderSetting);
    return await this.orderSettingRepo.save(existing);
  }

  async createOrderSettings(orderSetting: any): Promise<OrderSetting> {
    const newSetting = this.orderSettingRepo.create(orderSetting);
    return (await this.orderSettingRepo.save(
      newSetting,
    )) as unknown as OrderSetting;
  }

  async findTransactionByOrderId(orderId: string) {
    return await this.paymentService.findTransactionByOrderId(orderId);
  }

  async processPaystackRefund(reference: string, amount: number) {
    return await this.paystackService.initiateRefund(reference, amount);
  }

  async findDeliveryRiders(latitude: string, longitude: string) {
    try {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      const maxDistance = 20 * 1000; // 20km in meters

      // Note: This assumes User entity has a location field with PostGIS geometry
      // For now, returning all online riders. Location-based filtering can be added
      // if User entity has location coordinates stored
      const riders = await this.userRepo.find({
        where: {
          role: 'rider' as any,
          isApproved: true,
          isOnline: true,
        },
      });
      return riders;
    } catch (error) {
      return error;
    }
  }

  async findNearbyOrder(latitude: string, longitude: string) {
    try {
      const status = 'new';
      const maxDistanceKm = 20; // 20km
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);

      if (isNaN(lat) || isNaN(lng)) {
        throw new HttpException(
          'Invalid latitude or longitude provided',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Fetch all orders with status 'new' that have pickupCoordinates
      const orders = await this.orderRepo
        .createQueryBuilder('order')
        .where('order.status = :status', { status })
        .andWhere('order.pickupCoordinates IS NOT NULL')
        .orderBy('order.createdAt', 'DESC')
        .getMany();

      // Helper function to parse POINT string and extract coordinates
      const parsePointString = (
        pointString: string,
      ): { lat: number; lng: number } | null => {
        try {
          // Format: "POINT(longitude latitude)"
          const match = pointString.match(/POINT\(([^\s]+)\s+([^\s]+)\)/);
          if (match) {
            const lng = parseFloat(match[1]);
            const lat = parseFloat(match[2]);
            if (!isNaN(lat) && !isNaN(lng)) {
              return { lat, lng };
            }
          }
        } catch (error) {
          console.error('Error parsing point string:', error);
        }
        return null;
      };

      // Haversine formula to calculate distance between two points in kilometers
      const calculateDistance = (
        lat1: number,
        lng1: number,
        lat2: number,
        lng2: number,
      ): number => {
        const R = 6371; // Earth's radius in kilometers
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      // Filter orders within maxDistance
      const nearbyOrders = orders
        .map((order) => {
          const coords = parsePointString(order.pickupCoordinates);
          if (!coords) {
            return null;
          }
          const distance = calculateDistance(lat, lng, coords.lat, coords.lng);
          return { order, distance };
        })
        .filter((item) => item !== null && item.distance <= maxDistanceKm)
        .sort((a, b) => a.distance - b.distance) // Sort by distance (nearest first)
        .map((item) => item.order);

      return nearbyOrders;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      console.error('Error finding nearby orders:', error);
      throw new HttpException(
        error.message || 'Failed to find nearby orders',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async orderPayment(payload) {
    try {
      const theOrder = await this.orderRepo.findOne({
        where: { id: payload.orderId },
      });
      if (!theOrder) {
        throw new HttpException('No order with this id', HttpStatus.FORBIDDEN);
      }

      // Check if order payment is already successful
      if (theOrder.paymentStatus === 'SUCCESSFUL') {
        return {
          success: true,
          message: 'Order payment already completed successfully',
          data: {
            orderId: theOrder.id,
            paymentStatus: theOrder.paymentStatus,
            amount: theOrder.amount,
            alreadyPaid: true,
          },
        };
      }

      const reference = `REF-${generateOTP(12, false)}`;

      // Paystack expects amount in kobo (multiply by 100)
      const amountInKobo = Math.round(Number(theOrder.amount) * 100);

      const paymentPayload = {
        amount: amountInKobo,
        email: payload.user.email,
        reference: reference,
        callback_url: `${process.env.BASE_URL || 'https://plugex-backend-a67e2000f1f9.herokuapp.com'}/api/v1/payment/paystack-callback`,
        metadata: {
          orderId: payload.orderId,
          customerName: `${payload.user.firstName} ${payload.user.lastName}`,
          customerPhone: payload.user.phone,
        },
      };

      const paymentResponse =
        await this.paystackService.initializeTransaction(paymentPayload);

      // Create transaction record
      const transaction = await this.paymentService.createTransaction({
        user: payload.user.id || payload.user._id,
        orderId: payload.orderId,
        amount: theOrder.amount,
        reference: reference,
        type: 'debit' as any,
        narration: 'New Order placed',
        status: 'PENDING' as any,
      });

      return {
        success: true,
        message: 'Payment Initialize successfully',
        data: {
          authorization_url: paymentResponse.data.authorization_url,
          access_code: paymentResponse.data.access_code,
          reference: reference,
          amount: theOrder.amount,
        },
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'An error occurred while paying order',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async calculateDistance(payload: any) {
    const apikey = process.env.GOOGLE_API;
    const origins = payload.pickupCoordinates;
    const destinations = payload.deliveryCoordinates;
    const mode = 'driving';

    const params = {
      key: apikey,
      origins,
      destinations,
      mode,
      units: 'metric',
    };

    try {
      const distance = await axios.get(
        'https://maps.googleapis.com/maps/api/distancematrix/json',
        { params },
      );
      return distance.data;
    } catch (error) {
      throw new Error('Failed to calculate distance');
    }
  }

  async calculateDriverDistances(payload: {
    orderId: string;
    driverId: string;
  }) {
    const apikey = process.env.GOOGLE_API;
    const { orderId, driverId } = payload;

    // Fetch order and driver
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    const driver = await this.userRepo.findOne({
      where: { id: driverId, role: 'rider' as any },
    });

    if (!order || !driver) {
      throw new NotFoundException('Order or Driver not found');
    }

    // Parse PostGIS POINT format: "POINT(lng lat)"
    const parsePoint = (pointStr: string): [number, number] | null => {
      if (!pointStr) return null;
      const match = pointStr.match(/POINT\(([^ ]+) ([^ ]+)\)/);
      if (match) {
        return [parseFloat(match[1]), parseFloat(match[2])]; // [lng, lat]
      }
      return null;
    };

    // Ensure order has pickup and delivery coordinates
    if (!order.pickupCoordinates || !order.deliveryCoordinates) {
      throw new HttpException(
        'Order pickup or delivery coordinates not available',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Parse coordinates from PostGIS format
    const pickupCoords = parsePoint(order.pickupCoordinates);
    const deliveryCoords = parsePoint(order.deliveryCoordinates);

    if (!pickupCoords || !deliveryCoords) {
      throw new HttpException(
        'Invalid coordinates format',
        HttpStatus.BAD_REQUEST,
      );
    }

    // For driver location, we'll need to get it from a location service or assume default
    // Since User entity doesn't have location stored, using a placeholder
    // In production, you'd get driver's current location from location service
    const driverLat = 0; // Placeholder - get from location service
    const driverLng = 0; // Placeholder - get from location service
    const driverLatLng = `${driverLat},${driverLng}`;

    // Convert PostGIS coordinates to "lat,lng" string for Distance Matrix API
    const pickupLatLng = `${pickupCoords[1]},${pickupCoords[0]}`; // [lng, lat] -> lat,lng
    const deliveryLatLng = `${deliveryCoords[1]},${deliveryCoords[0]}`; // [lng, lat] -> lat,lng

    const toPickup = await this.calculateDistance({
      pickupCoordinates: driverLatLng,
      deliveryCoordinates: pickupLatLng,
    });
    const toDelivery = await this.calculateDistance({
      pickupCoordinates: driverLatLng,
      deliveryCoordinates: deliveryLatLng,
    });

    const pickupToDelivery = await this.calculateDistance({
      pickupCoordinates: pickupLatLng,
      deliveryCoordinates: deliveryLatLng,
    });

    return {
      distanceMatrix: {
        toPickup: {
          distance: toPickup.rows[0].elements[0].distance.value / 1000, // in km
          eta: toPickup.rows[0].elements[0].duration.value / 60, // in minutes
        },
        toDelivery: {
          distance: toDelivery.rows[0].elements[0].distance.value / 1000,
          eta: toDelivery.rows[0].elements[0].duration.value / 60,
        },
        pickupToDelivery: {
          distance: pickupToDelivery.rows[0].elements[0].distance.value / 1000,
          eta: pickupToDelivery.rows[0].elements[0].duration.value / 60,
        },
      },
    };
  }

  // Listen for order status changes and emit via socket.io
  // Note: MongoDB change streams are not available in PostgreSQL
  // This method would need to be refactored to use PostgreSQL triggers or polling
  // For now, keeping the method signature but implementation needs adjustment
  watchOrderStatusChange(io: Server) {
    // PostgreSQL doesn't have change streams like MongoDB
    // This would need to be implemented using:
    // - Database triggers with NOTIFY/LISTEN
    // - Polling mechanism
    // - Event sourcing pattern
    // Keeping method for compatibility, but functionality needs re-implementation
    console.warn(
      'watchOrderStatusChange: MongoDB change streams not available in PostgreSQL. This needs re-implementation.',
    );
  }
  // private io: Server;

  // setSocketServer(io: Server) {
  //     this.io = io;
  // }

  // onModuleInit() {
  //     this.watchOrderStatusChange();
  // }

  // private watchOrderStatusChange() {
  //     const changeStream = this.orderModel.watch([{ $match: { 'updateDescription.updatedFields.status': { $exists: true } } }]);
  //     changeStream.on('change', async (change) => {
  //         if (change.operationType === 'update' && change.updateDescription.updatedFields.status) {
  //             const orderId = change.documentKey._id;
  //             const order = await this.orderModel.findById(orderId)
  //                 .populate({
  //                     path: "user",
  //                     select: "firstName lastName phone email photo"
  //                 })
  //                 .populate({
  //                     path: "driver",
  //                     select: "phone platenumber rating totalDelivery frontImage firstName photo"
  //                 })
  //                 .exec();
  //             if (order && order.user && order.user._id && this.io) {
  //                 this.io.emit(`order-${order.user._id}`, order);
  //             }
  //         }
  //     });
  // }
  // }

  // async calculateDistance(payload: any){

  //     const apikey = process.env.GOOGLE_API;
  //     console.log("the apikey--------------->>>", apikey, payload)
  //     const origins = payload.pickupCoordinates;
  //     const destinations = payload.deliveryCoordinates;
  //     const params = {
  //         key: apikey,
  //         origins: origins,
  //         destinations: destinations,
  //         mode: 'driving',
  //         unitSystem: 'imperial'
  //     };
  //     console.log("the params--------------->>>", params)
  //     try {
  //         const distance = await axios.get('https://maps.googleapis.com/maps/api/distancematrix/json', { params });
  //         console.log("distance-------------------->>>", distance.data)
  //         return distance.data;
  //     } catch (error) {
  //         console.log("-------------------->>>", error)

  //     }
  // }

  async createMultipleOrders(payload: any) {
    const results = [];
    for (const delivery of payload.deliveries) {
      // Calculate cost for each delivery
      const costDistanceMatrix = await this.calculateCost({
        pickupCoordinates: `${payload.pickupLocation.coordinate.lat},${payload.pickupLocation.coordinate.lng}`,
        deliveryCoordinates: `${delivery.deliveryLocation.coordinate.lat},${delivery.deliveryLocation.coordinate.lng}`,
        deliveryType: payload.deliveryType || 'instant',
        packageCategory: payload.packageType || payload.packageCategory,
      });
      if (costDistanceMatrix.success === false) {
        results.push({
          success: false,
          message: 'Unable to calculate cost',
          delivery,
        });
        continue;
      }
      const distance = costDistanceMatrix.data.distance;
      const eta = costDistanceMatrix.data.eta;
      const cost = costDistanceMatrix.data.cost;

      // Convert coordinates to PostGIS format
      const pickupPoint = `POINT(${payload.pickupLocation.coordinate.lng} ${payload.pickupLocation.coordinate.lat})`;
      const deliveryPoint = `POINT(${delivery.deliveryLocation.coordinate.lng} ${delivery.deliveryLocation.coordinate.lat})`;

      const orderData = {
        ...payload,
        deliveryLocation: delivery.deliveryLocation,
        receiverDetails: delivery.receiverDetails,
        pickupCoordinates: pickupPoint,
        deliveryCoordinates: deliveryPoint,
        amount: cost,
        distance: distance,
        eta: eta,
      };
      // Remove deliveries array from orderData
      delete orderData.deliveries;
      const result = await this.createOrder(orderData);
      results.push(result);
    }
    return {
      success: true,
      message: 'Multiple orders placed successfully',
      data: results,
    };
  }

  async calculateMultipleCost(payload: any) {
    const orderSettings = await this.getOrCreateOrderSettings();
    const costPerKm = orderSettings.costPerKm;
    const minCost = orderSettings.minCost;
    const maxCost = orderSettings.maxCost;
    const deliveryTypePricing =
      orderSettings.deliveryTypePricing || ({} as any);

    const costResults = [];
    let totalCost = 0;
    let totalDistance = 0;
    let totalEta = 0;
    let totalDeliveryTypeCost = 0;

    for (const deliveryCoord of payload.deliveryCoords) {
      try {
        const distancematrix = await this.calculateDistance({
          pickupCoordinates: payload.pickupCoordinates,
          deliveryCoordinates: `${deliveryCoord.deliveryCoords.latitude},${deliveryCoord.deliveryCoords.longitude}`,
        });

        const distance = parseFloat(
          (distancematrix.rows[0].elements[0].distance.value / 1000).toFixed(2),
        );
        const eta = parseFloat(
          (distancematrix.rows[0].elements[0].duration.value / 60).toFixed(2),
        );

        // Normalize delivery type
        const normalizedTypeRaw = (payload.deliveryType || 'instant')
          .toString()
          .toLowerCase();
        const normalizedDeliveryType =
          normalizedTypeRaw === 'schedule' ? 'schedule' : 'instant';

        // Calculate base cost using perKm override if available
        const perKmConfig = (orderSettings as any).perKmPricing || {};
        const perKm =
          typeof perKmConfig.normal === 'number'
            ? perKmConfig.normal
            : costPerKm;

        // Calculate base cost with only minCost applied (no maxCost limit)
        const calculatedCost = distance * perKm;
        const baseCost = Math.ceil(Math.max(minCost, calculatedCost));

        // Add delivery type cost if deliveryType is provided
        let deliveryTypeCost = 0;
        const typeCost = deliveryTypePricing[normalizedDeliveryType];
        if (typeof typeCost === 'number' && typeCost > 0) {
          deliveryTypeCost = typeCost;
        }

        // Add perishable surcharge if package category is perishable
        let perishableSurcharge = 0;
        if (payload.packageCategory === 'perishable') {
          perishableSurcharge = 1000;
        }

        let totalDeliveryCost =
          baseCost + deliveryTypeCost + perishableSurcharge;

        costResults.push({
          deliveryCoords: deliveryCoord.deliveryCoords,
          distance,
          eta,
          cost: totalDeliveryCost,
          baseCost,
          deliveryTypeCost,
          perishableSurcharge:
            perishableSurcharge > 0 ? perishableSurcharge : undefined,
          deliveryType: normalizedDeliveryType,
        });

        totalCost += totalDeliveryCost;
        totalDistance += distance;
        totalEta += eta;
        totalDeliveryTypeCost += deliveryTypeCost;
      } catch (error) {
        costResults.push({
          deliveryCoords: deliveryCoord.deliveryCoords,
          error: 'Unable to calculate cost for this delivery location',
        });
      }
    }

    // Calculate total perishable surcharge
    const totalPerishableSurcharge =
      payload.packageCategory === 'perishable'
        ? 1000 * payload.deliveryCoords.length
        : 0;

    return {
      success: true,
      message: 'Multiple delivery costs calculated successfully',
      data: {
        individualCosts: costResults,
        summary: {
          totalCost,
          totalDistance: parseFloat(totalDistance.toFixed(2)),
          totalEta: parseFloat(totalEta.toFixed(2)),
          totalDeliveryTypeCost,
          totalPerishableSurcharge:
            totalPerishableSurcharge > 0 ? totalPerishableSurcharge : undefined,
          numberOfDeliveries: payload.deliveryCoords.length,
          deliveryType: payload.deliveryType || 'instant',
        },
      },
    };
  }

  async getCostWithTrafficWeather(body: any) {
    const payload: any = {
      pickupCoordinates: `${body.pickupCoords.latitude},${body.pickupCoords.longitude}`,
      deliveryCoordinates: `${body.deliveryCoords.latitude},${body.deliveryCoords.longitude}`,
      deliveryType: body.deliveryType || 'instant',
      packageCategory: body.packageCategory,
    };

    const traffic = await this.trafficWeatherService.getTrafficCondition(
      payload.pickupCoordinates,
      payload.deliveryCoordinates,
    );
    const weather = await this.trafficWeatherService.getWeatherCondition(
      body.pickupCoords.latitude,
      body.pickupCoords.longitude,
    );

    payload.traffic = traffic.level;
    payload.weather = weather.condition;

    return await this.calculateCost(payload);
  }

  async comparePricingWithTrafficWeather(body: any) {
    const basePayload = {
      pickupCoordinates: `${body.pickupCoords.latitude},${body.pickupCoords.longitude}`,
      deliveryCoordinates: `${body.deliveryCoords.latitude},${body.deliveryCoords.longitude}`,
      packageCategory: body.packageCategory,
    };

    const traffic = await this.trafficWeatherService.getTrafficCondition(
      basePayload.pickupCoordinates,
      basePayload.deliveryCoordinates,
    );
    const weather = await this.trafficWeatherService.getWeatherCondition(
      body.pickupCoords.latitude,
      body.pickupCoords.longitude,
    );

    // Calculate instant pricing
    const instantResult = await this.calculateCost({
      ...basePayload,
      deliveryType: 'instant',
      traffic: traffic.level,
      weather: weather.condition,
    });

    // Calculate schedule pricing
    const scheduleResult = await this.calculateCost({
      ...basePayload,
      deliveryType: 'schedule',
      traffic: traffic.level,
      weather: weather.condition,
    });

    return {
      success: true,
      message: 'Pricing comparison calculated successfully',
      data: {
        instant: instantResult.data,
        schedule: scheduleResult.data,
        difference: instantResult.data.cost - scheduleResult.data.cost,
        conditions: {
          traffic: traffic.level,
          weather: weather.condition,
        },
        validation: {
          instantIsMoreExpensive:
            instantResult.data.cost > scheduleResult.data.cost,
          priceDifference: instantResult.data.cost - scheduleResult.data.cost,
        },
      },
    };
  }

  async prepareOrderData(body: any, user: any) {
    const costDistanceMatrix = await this.calculateCost({
      pickupCoordinates: `${body.pickupLocation.coordinate.lat},${body.pickupLocation.coordinate.lng}`,
      deliveryCoordinates: `${body.deliveryLocation.coordinate.lat},${body.deliveryLocation.coordinate.lng}`,
      deliveryType: body.deliveryType || 'instant',
      packageCategory: body.packageType || body.packageCategory,
    });

    if (costDistanceMatrix.success === false) {
      throw new HttpException('Unable to calculate cost', HttpStatus.FORBIDDEN);
    }

    const distance = costDistanceMatrix.data.distance;
    const eta = costDistanceMatrix.data.eta;
    const cost = costDistanceMatrix.data.cost;

    return {
      ...body,
      scope: body.scope,
      vehicle: body.vehicle,
      packageType: body.packageType,
      paymentMethod: body.paymentMethod,
      pickupCoordinates: {
        type: 'Point',
        coordinates: [
          body.pickupLocation.coordinate.lng,
          body.pickupLocation.coordinate.lat,
        ],
      },
      deliveryCoordinates: {
        type: 'Point',
        coordinates: [
          body.deliveryLocation.coordinate.lng,
          body.deliveryLocation.coordinate.lat,
        ],
      },
      closeLandmark: body.closeLandmark,
      deliveryType: body.deliveryType,
      shippingType: body.shippingType,
      receiverDetails: body.receiverDetails,
      pickupDetails: body.pickupDetails,
      instruction: body.instruction,
      scheduledPickupTime: body.scheduledPickupTime,
      description: body.description,
      packageSize: body.packageSize,
      images: body.images,
      amount: cost,
      distance: distance,
      eta: eta,
      user,
    };
  }

  async acceptOrderWithValidation(orderId: string, user: any) {
    if (!user.role && !user.roles.includes('driver')) {
      throw new HttpException(
        'You do not have the required role to accept this order',
        HttpStatus.FORBIDDEN,
      );
    }

    const invalidStatuses = [
      'accepted',
      'arrived',
      'delayed',
      'collected',
      'started',
      'completed',
      'cancelled',
    ];
    const order = await this.findOne(orderId);

    if (!order) {
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }

    if (invalidStatuses.includes(order.status)) {
      throw new HttpException(
        `Order cannot be accepted as it is already in '${order.status}' status.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Get user ID from authenticated user object
    const userId = user.id || user.sub || user._id?.toString();
    if (!userId) {
      throw new HttpException('User ID not found', HttpStatus.BAD_REQUEST);
    }

    // If order is assigned, validate that the accepting rider is the assigned rider
    if (order.status === 'assigned') {
      if (order.driverId !== userId?.toString()) {
        throw new HttpException(
          'This order is assigned to another rider. Only the assigned rider can accept it.',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    const driver = await this.driverService.getDriverProfile(userId);
    if (!driver.isApproved) {
      throw new HttpException(
        'Your account is not approved. Please wait for approval.',
        HttpStatus.FORBIDDEN,
      );
    }

    // Check driver wallet limit before accepting order
    try {
      const limitAmount = await this.paymentService.getBalanceLimit();
      const walletBalance = await this.walletService.getWalletBalance(
        driver.id.toString(),
      );
      if (walletBalance < limitAmount) {
        throw new HttpException(
          'Your wallet balance is below the limit. Please fund your wallet to accept orders.',
          HttpStatus.FORBIDDEN,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // If error checking limit, log but don't block order acceptance
      console.error('Error checking wallet limit:', error);
    }

    const payload = {
      status: 'accepted',
      acceptTime: new Date(),
      driverId: driver.id,
    };
    const newOrder = await this.updateOrder(orderId, payload);

    try {
      if (newOrder.paymentMethod === 'cash') {
        // Deduct commission from rider wallet for cash payments
        const riderUserId = driver.id?.toString();
        // Get user ID from order - could be populated or just ID reference
        const orderUser = order.user;
        let userId: string | undefined;

        if (orderUser) {
          // If user is populated (Mongoose document), get _id
          if (typeof orderUser === 'object' && '_id' in orderUser) {
            userId = (orderUser as any)._id?.toString();
          } else if (typeof orderUser === 'object' && 'id' in orderUser) {
            userId = (orderUser as any).id?.toString();
          } else {
            userId = orderUser.toString();
          }
        }

        if (riderUserId && userId && newOrder.amount) {
          await this.paymentService.processCashPayment(
            userId,
            newOrder.amount,
            orderId,
            riderUserId,
          );
          // Update order payment status to SUCCESSFUL after commission deduction
          await this.updateOrder(orderId, {
            paymentStatus: 'SUCCESSFUL',
          });
        }
      }
    } catch (paymentError) {
      // Log error but don't fail the order acceptance
      console.error(
        'Error processing payment on order acceptance:',
        paymentError,
      );
    }

    // Format response with driver and vehicle information (use driver profile which has all relations loaded)
    const driverInfo = driver
      ? {
          id: driver.id,
          firstName: driver.firstName,
          lastName: driver.lastName,
          phoneNumber: driver.phoneNumber,
          email: driver.email,
          averageRating: driver.averageRating,
          selfie: driver.profileImage?.url || null, // Selfie image
          vehicle: driver.vehicle
            ? {
                id: driver.vehicle.id,
                vehicleType: driver.vehicle.vehicleType,
                vehicleBrand: driver.vehicle.vehicleBrand,
                vehicleYear: driver.vehicle.vehicleYear,
                vehicleColor: driver.vehicle.vehicleColor,
                licensePlate: driver.vehicle.licensePlate,
                vehicleCapacity: driver.vehicle.vehicleCapacity,
                unit: driver.vehicle.unit,
                specialEquipment: driver.vehicle.specialEquipment,
              }
            : null,
        }
      : null;

    // Send order accepted email and notification to user
    try {
      if (newOrder.user && driver) {
        await this.mailService.sendOrderAcceptedEmail(
          newOrder,
          newOrder.user,
          driver,
        );
        // Send push and in-app notification
        if (newOrder.userId) {
          await this.notificationService.sendOrderNotification(
            newOrder.userId.toString(),
            NotificationType.ORDER_ACCEPTED,
            newOrder,
            { riderName: driver.firstName + ' ' + driver.lastName },
          );
        }
      }
    } catch (emailError) {
      console.error('Error sending order accepted email:', emailError);
      // Don't fail order acceptance if email fails
    }

    return {
      success: true,
      message: 'Order accepted successfully',
      data: {
        ...newOrder,
        driver: driverInfo,
      },
    };
  }

  async cancelOrderWithRefund(orderId: string, user: any) {
    if (!user.role && !user.roles.includes('driver')) {
      throw new HttpException(
        'You do not have the required role to cancel this order',
        HttpStatus.FORBIDDEN,
      );
    }

    const invalidStatuses = ['arrived', 'completed', 'cancelled'];
    const order = await this.findOne(orderId);

    if (!order) {
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }

    if (invalidStatuses.includes(order.status)) {
      throw new HttpException(
        `Order cannot be cancelled as it is already in '${order.status}' status.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Handle payment refund if payment was successful
    if (order.paymentStatus === 'SUCCESSFUL') {
      // If payment method is wallet, refund to user wallet
      if (order.paymentMethod === 'wallet') {
        const userId =
          typeof order.user === 'object' && '_id' in order.user
            ? (order.user as any)._id?.toString()
            : order.user?.toString();
        if (userId) {
          await this.walletService.creditWallet(userId, Number(order.amount));
        }
      } else if (order.paymentMethod === 'card') {
        // For card payments, process Paystack refund
        try {
          // Find the transaction to get the reference
          const transaction =
            await this.paymentService.findTransactionByOrderId(
              order.id.toString(),
            );
          if (transaction && transaction.reference) {
            await this.processPaystackRefund(
              transaction.reference,
              order.amount,
            );
          }
        } catch (error) {
          console.error('Error processing Paystack refund:', error);
          throw new HttpException(
            'Error processing payment refund. Please contact support.',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }

      // If order has a driver and payment method is not cash, debit driver's wallet (reverse the credit)
      if (order.driverId && order.paymentMethod !== 'cash') {
        try {
          // Extract driver ID - use driverId field (most reliable)
          // Fallback to extracting from driver relation object if driverId is not available
          let driverId: string;
          if (order.driverId) {
            driverId = order.driverId.toString();
          } else if (order.driver) {
            // Handle case where driver is a populated relation object
            if (typeof order.driver === 'object' && order.driver !== null) {
              driverId =
                (order.driver as any).id?.toString() ||
                (order.driver as any)._id?.toString();
            } else if (typeof order.driver === 'string') {
              driverId = order.driver;
            }
          }

          if (!driverId) {
            console.error('Unable to extract driver ID from order');
            return;
          }

          // Get driver profile by driver ID (which is the user ID in TypeORM)
          const driverUser =
            await this.driverService.getDriverProfile(driverId);
          if (driverUser && driverUser.id) {
            // Debit the amount that was credited to driver
            const limitAmount = await this.paymentService.getBalanceLimit();
            await this.walletService.debitWallet(
              driverUser.id.toString(),
              Number(order.amount),
              'Order cancellation - reversing earnings',
              true, // allowNegative
              limitAmount, // negativeLimit
            );
          }
        } catch (error) {
          console.error('Error debiting driver wallet:', error);
        }
      }
    }

    const payload = {
      status: 'cancelled',
      cancelledAt: new Date(),
    };
    const newOrder = await this.updateOrder(orderId, payload);

    return {
      success: true,
      message: 'Order cancelled successfully',
      data: newOrder,
    };
  }

  async payWithWalletLogic(orderId: string, user: any) {
    const order = await this.findOne(orderId);

    if (!order) {
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }

    const userId = user.id || user.sub || user._id?.toString();
    if (!userId) {
      throw new HttpException('User ID not found', HttpStatus.BAD_REQUEST);
    }

    // Check if user owns the order
    const orderUserId =
      typeof order.user === 'object' && 'id' in order.user
        ? (order.user as any).id?.toString()
        : typeof order.user === 'object' && '_id' in order.user
          ? (order.user as any)._id?.toString()
          : order.user?.toString();

    if (orderUserId !== userId) {
      throw new HttpException(
        'You can only pay for your own orders',
        HttpStatus.FORBIDDEN,
      );
    }

    if (order.paymentStatus === 'SUCCESSFUL') {
      throw new HttpException(
        'Order has already been paid for',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const wallet = await this.walletService.getWallet(userId);
      const balance = Number(wallet.balance);
      if (balance < order.amount) {
        throw new HttpException(
          'Insufficient wallet balance',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Debit wallet
      await this.walletService.debitWallet(
        userId,
        order.amount,
        'Order payment via wallet',
      );

      // Create transaction reference for wallet payment
      const transactionReference = `WAL-${generateOTP(12, false)}`;

      // Create PaymentTransaction for payment tracking
      await this.paymentService.createTransaction({
        user: userId, // PaymentService will handle user lookup
        orderId: orderId,
        amount: order.amount,
        reference: transactionReference,
        narration: 'Order payment via wallet',
        status: PaymentTransactionStatus.SUCCESSFUL as any,
        isVerified: true,
        type: PaymentTransactionType.DEBIT as any,
        verifiedAt: new Date(),
      });

      // Create Transaction record for transaction history
      await this.transactionService.createTransaction({
        userId: userId,
        orderId: orderId,
        type: TransactionType.DEBIT,
        amount: order.amount,
        currency: 'NGN',
        narration: 'Order payment via wallet',
        status: TransactionStatus.SUCCESSFUL,
        reference: transactionReference,
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // If wallet doesn't exist or other error, throw
      throw new HttpException(
        error.message || 'Failed to process wallet payment',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Update order payment status and method
    const updatedOrder = await this.updateOrder(orderId, {
      paymentStatus: 'SUCCESSFUL',
      paymentMethod: 'wallet',
      paidAt: new Date(),
    });

    // Credit driver ledger now (non-cash flow) so funds are held until completion
    if (updatedOrder && updatedOrder.driver) {
      try {
        // Get driver profile by driver ID
        const driverRecord = await this.driverService.getDriverProfile(
          updatedOrder.driver.toString(),
        );
        if (driverRecord && driverRecord.id) {
          await this.walletService.creditDriverWalletLedger(
            driverRecord.id.toString(),
            updatedOrder.amount,
          );
        }
      } catch (error) {
        console.error(
          'Error crediting driver ledger for wallet payment:',
          error,
        );
      }
    }

    return {
      success: true,
      message: 'Payment successful using wallet',
      data: {
        order: updatedOrder,
        amount: order.amount,
        paymentMethod: 'wallet',
      },
    };
  }

  async startOrderWithValidation(orderId: string, user: any) {
    if (!user.role && !user.roles.includes('driver')) {
      throw new HttpException(
        'You do not have the required role to start this order',
        HttpStatus.FORBIDDEN,
      );
    }

    const invalidStatuses = [
      'new',
      'arrived',
      'delayed',
      'collected',
      'started',
      'completed',
      'cancelled',
    ];
    const order = await this.findOne(orderId);

    if (!order) {
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }

    if (invalidStatuses.includes(order.status)) {
      throw new HttpException(
        `Order cannot be start as it is already in '${order.status}' status.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Get user ID from authenticated user object
    const userId = user.id || user.sub || user._id?.toString();
    if (!userId) {
      throw new HttpException('User ID not found', HttpStatus.BAD_REQUEST);
    }

    const payload = {
      status: 'started',
      startTime: new Date(),
    };
    const newOrder = await this.updateOrder(orderId, payload);

    // Send order started email and notification to user
    try {
      if (newOrder.user && newOrder.driver) {
        await this.mailService.sendOrderStartedEmail(
          newOrder,
          newOrder.user,
          newOrder.driver,
        );
        // Send push and in-app notification
        if (newOrder.userId) {
          await this.notificationService.sendOrderNotification(
            newOrder.userId.toString(),
            NotificationType.ORDER_STARTED,
            newOrder,
          );
        }
      }
    } catch (emailError) {
      console.error('Error sending order started email:', emailError);
      // Don't fail order start if email fails
    }

    return {
      success: true,
      message: 'Order started successfully',
      data: newOrder,
    };
  }

  async completeOrderWithValidation(orderId: string, user: any) {
    if (!user.role && !user.roles.includes('driver')) {
      throw new HttpException(
        'You do not have the required role to start this order',
        HttpStatus.FORBIDDEN,
      );
    }

    const invalidStatuses = ['new', 'arrived', 'completed', 'cancelled'];
    const order = await this.findOne(orderId);

    if (!order) {
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }

    if (invalidStatuses.includes(order.status)) {
      throw new HttpException(
        `Order cannot be complete as it is already in '${order.status}' status.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Get user ID from authenticated user object
    const userId = user.id || user.sub || user._id?.toString();
    if (!userId) {
      throw new HttpException('User ID not found', HttpStatus.BAD_REQUEST);
    }

    const payload = {
      status: 'completed',
      completeTime: new Date(),
    };
    const newOrder = await this.updateOrder(orderId, payload);

    // Handle order completion wallet operations
    await this.handleOrderCompletion(newOrder);

    // Send order completed email and notification to user
    try {
      if (newOrder.user && newOrder.driver) {
        await this.mailService.sendOrderCompletedEmail(
          newOrder,
          newOrder.user,
          newOrder.driver,
        );
        // Send push and in-app notification
        if (newOrder.userId) {
          await this.notificationService.sendOrderNotification(
            newOrder.userId.toString(),
            NotificationType.ORDER_COMPLETED,
            newOrder,
          );
        }
      }
    } catch (emailError) {
      console.error('Error sending order completed email:', emailError);
      // Don't fail order completion if email fails
    }

    return {
      success: true,
      message: 'Order completed successfully',
      data: newOrder,
    };
  }

  async assignOrderToRider(orderId: string, riderId: string, user: any) {
    // Validate and normalize UUIDs
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const normalizedOrderId = orderId?.trim();
    const normalizedRiderId = riderId?.trim();

    if (!normalizedOrderId || !uuidRegex.test(normalizedOrderId)) {
      throw new HttpException(
        `Invalid order ID format: ${orderId}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!normalizedRiderId || !uuidRegex.test(normalizedRiderId)) {
      throw new HttpException(
        `Invalid rider ID format: ${riderId}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate order exists and belongs to user
    const order = await this.orderRepo.findOne({
      where: { id: normalizedOrderId },
      relations: ['user'],
    });

    if (!order) {
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }

    const userId = user.id || user.sub || user._id?.toString();
    if (order.userId !== userId?.toString()) {
      throw new HttpException(
        'You do not have permission to assign this order',
        HttpStatus.FORBIDDEN,
      );
    }

    // Validate order status
    if (order.status !== 'new' && order.status !== 'assigned') {
      throw new HttpException(
        `Order cannot be assigned as it is in '${order.status}' status`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate rider exists, is approved, and has 'rider' role
    const rider = await this.userRepo.findOne({
      where: { id: normalizedRiderId },
    });

    if (!rider) {
      throw new HttpException('Rider not found', HttpStatus.NOT_FOUND);
    }

    if (rider.role !== 'rider') {
      throw new HttpException(
        'The specified user is not a rider',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!rider.isApproved) {
      throw new HttpException(
        'The specified rider is not approved',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Update order: set driverId, set status to 'assigned'
    const payload = {
      driverId: normalizedRiderId,
      status: 'assigned',
    };
    const updatedOrder = await this.updateOrder(normalizedOrderId, payload);

    // Send assignment email and notification to rider
    try {
      if (updatedOrder.user && updatedOrder.driver) {
        await this.mailService.sendOrderAssignedEmail(
          updatedOrder,
          updatedOrder.user,
          updatedOrder.driver,
        );
        // Send push and in-app notification to rider
        if (normalizedRiderId) {
          const customerName =
            order.user?.firstName && order.user?.lastName
              ? `${order.user.firstName} ${order.user.lastName}`
              : order.user?.email || 'Customer';
          await this.notificationService.sendOrderNotification(
            normalizedRiderId,
            NotificationType.ORDER_ASSIGNED,
            updatedOrder,
            { customerName },
          );
        }
      }
    } catch (emailError) {
      console.error('Error sending order assigned email:', emailError);
      // Don't fail assignment if email fails
    }

    return {
      success: true,
      message: 'Order assigned to rider successfully',
      data: updatedOrder,
    };
  }

  async rejectAssignedOrder(orderId: string, rider: any) {
    // Validate rider has 'rider' role
    const riderId = rider.id || rider.sub || rider._id?.toString();
    if (!riderId) {
      throw new HttpException('Rider ID not found', HttpStatus.BAD_REQUEST);
    }

    // Get order with relations before clearing driverId
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: [
        'user',
        'user.profileImage',
        'driver',
        'driver.vehicle',
        'driver.profileImage',
      ],
    });

    if (!order) {
      throw new HttpException('Order not found', HttpStatus.NOT_FOUND);
    }

    // Validate order is assigned to this rider
    if (order.driverId !== riderId) {
      throw new HttpException(
        'This order is not assigned to you',
        HttpStatus.FORBIDDEN,
      );
    }

    // Validate order status is 'assigned'
    if (order.status !== 'assigned') {
      throw new HttpException(
        `Order cannot be rejected as it is in '${order.status}' status`,
        HttpStatus.BAD_REQUEST,
      );
    }

    // Store rider info for email before clearing
    const riderInfo = order.driver;
    const userInfo = order.user;

    // Update order: clear driverId (set to null), set status back to 'new'
    const payload = {
      driverId: null,
      status: 'new',
    };
    const updatedOrder = await this.updateOrder(orderId, payload);

    // Send rejection email and notification to user
    try {
      if (userInfo && riderInfo) {
        await this.mailService.sendOrderRejectedEmail(
          order,
          userInfo,
          riderInfo,
        );
        // Send push and in-app notification to user
        if (order.userId) {
          await this.notificationService.sendOrderNotification(
            order.userId.toString(),
            NotificationType.ORDER_REJECTED,
            order,
          );
        }
      }
    } catch (emailError) {
      console.error('Error sending order rejected email:', emailError);
      // Don't fail rejection if email fails
    }

    return {
      success: true,
      message: 'Order assignment rejected successfully',
      data: updatedOrder,
    };
  }

  async getAssignedOrders(riderId: string, status?: string) {
    const whereClause: any = { driverId: riderId?.toString() };

    // If status is provided, filter by it; otherwise default to 'assigned'
    if (status && status.trim() !== '') {
      whereClause.status = status.trim();
    } else {
      whereClause.status = 'assigned';
    }

    const orders = await this.orderRepo.find({
      where: whereClause,
      relations: [
        'user',
        'user.profileImage',
        'driver',
        'driver.vehicle',
        'driver.profileImage',
      ],
      order: { createdAt: 'DESC' },
    });

    // Serialize orders to include vehicle and profile image info
    const serializedOrders = orders.map((order) => this.serializeOrder(order));

    return {
      success: true,
      message: 'Assigned orders fetched successfully',
      data: serializedOrders,
    };
  }

  /**
   * Generate and send receipt for completed order (automatic)
   */
  private async generateAndSendReceipt(order: Order): Promise<void> {
    try {
      if (!order.user) {
        console.error('Cannot generate receipt: Order user not found');
        return;
      }

      const receiptPDF = await this.receiptService.generateReceiptPDF(
        order,
        order.user,
        order.driver || null,
      );

      await this.mailService.sendReceiptEmail(order, order.user, receiptPDF);
    } catch (error) {
      console.error('Error in generateAndSendReceipt:', error);
      throw error;
    }
  }

  /**
   * Generate receipt for order on-demand (with access control)
   */
  async generateReceiptForOrder(
    orderId: string,
    requestingUser: any,
  ): Promise<{ success: boolean; message: string }> {
    // Find order with relations
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: [
        'user',
        'user.profileImage',
        'driver',
        'driver.vehicle',
        'driver.profileImage',
      ],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check if order is completed
    if (order.status !== 'completed') {
      throw new BadRequestException(
        'Receipt can only be generated for completed orders',
      );
    }

    // Access control
    const userId =
      requestingUser.id || requestingUser.sub || requestingUser._id;
    const userRole = requestingUser.role || requestingUser.roles?.[0];

    const isAdmin = userRole === 'admin';
    const isOrderOwner = order.userId === userId?.toString();
    const isOrderDriver = order.driverId === userId?.toString();

    if (!isAdmin && !isOrderOwner && !isOrderDriver) {
      throw new HttpException(
        'You do not have permission to access this receipt',
        HttpStatus.FORBIDDEN,
      );
    }

    try {
      if (!order.user) {
        throw new BadRequestException('Order user information not found');
      }

      // Generate PDF receipt
      const receiptPDF = await this.receiptService.generateReceiptPDF(
        order,
        order.user,
        order.driver || null,
      );

      // Send receipt email
      await this.mailService.sendReceiptEmail(order, order.user, receiptPDF);

      return {
        success: true,
        message: 'Receipt generated and sent to customer email successfully',
      };
    } catch (error) {
      console.error('Error generating receipt:', error);
      throw new HttpException(
        error.message || 'Failed to generate receipt',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
