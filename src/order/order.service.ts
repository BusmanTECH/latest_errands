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

    
    const pickupCoords = payload.pickupCoordinates?.coordinates || [
      payload.pickupLocation?.coordinate?.lng,
      payload.pickupLocation?.coordinate?.lat,
    ];
    const deliveryCoords = payload.deliveryCoordinates?.coordinates || [
      payload.deliveryLocation?.coordinate?.lng,
      payload.deliveryLocation?.coordinate?.lat,
    ];

    
    const pickupPoint =
      pickupCoords && pickupCoords.length === 2
        ? `POINT(${pickupCoords[0]} ${pickupCoords[1]})`
        : null;
    const deliveryPoint =
      deliveryCoords && deliveryCoords.length === 2
        ? `POINT(${deliveryCoords[0]} ${deliveryCoords[1]})`
        : null;

    
    const userId = payload.user?.id || payload.user?.sub || payload.user?._id;

    
    const { user, ...orderPayload } = payload;

    
    const orderData = this.orderRepo.create({
      ...orderPayload,
      trackingCode,
      paymentStatus: 'PENDING' as any, 
      pickupCoordinates: pickupPoint,
      deliveryCoordinates: deliveryPoint,
      userId: userId?.toString(),
    });

    let newOrder = (await this.orderRepo.save(orderData)) as unknown as Order;

    let paymentReference: string | undefined;
    let paymentStatus = 'PENDING';

    
    if (payload.paymentMethod === 'card') {
      
      const userId = payload.user?.id || payload.user?.sub || payload.user?._id;
      if (!userId) {
        
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

        
        newOrder.paymentStatus = paymentStatus as any;
        newOrder.paymentReference = paymentReference;
        newOrder = await this.orderRepo.save(newOrder);
      } catch (error) {
        
        await this.orderRepo.delete(newOrder.id);
        throw new HttpException(
          error.message || 'Failed to process card payment',
          HttpStatus.BAD_REQUEST,
        );
      }
    } else if (payload.paymentMethod === 'wallet') {
      
      
      const userId = payload.user?.id || payload.user?.sub || payload.user?._id;
      if (!userId) {
        await this.orderRepo.delete(newOrder.id);
        throw new BadRequestException('User ID is required for wallet payment');
      }

      try {
        
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

        
        await this.walletService.debitWallet(
          userId.toString(),
          payload.amount,
          'Order payment via wallet',
        );

        const reference = `WAL-${generateOTP(12, false)}`;

        
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
      
      paymentStatus = 'PENDING';
      
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

    
    try {
      const orderUser = await this.userRepo.findOne({
        where: { id: userId?.toString() },
      });
      if (orderUser) {
        
        const orderForEmail = await this.orderRepo.findOne({
          where: { id: newOrder.id },
          relations: ['user'],
        });
        if (orderForEmail) {
          await this.mailService.sendOrderCreatedEmail(
            orderForEmail,
            orderUser,
          );
          
          await this.notificationService.sendOrderNotification(
            userId?.toString(),
            NotificationType.ORDER_CREATED,
            orderForEmail,
          );
        }
      }
    } catch (emailError) {
      console.error('Error sending order created email:', emailError);
      
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
        
        if (status !== order.status) {
          title = 'Order Status Updated';
          message = `Your order with tracking code ${order.trackingCode} status has been updated to: ${status}`;
          type = 'order_status_updated';
        }
        break;
    }

    
    
    
    
    
    
    
    
    
    
    
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

    
    let query: any = { ...sanitizedFilters };

    if (searchKeyword) {
      query.$or = [
        { trackingCode: { $regex: searchKeyword, $options: 'i' } },
        { status: { $regex: searchKeyword, $options: 'i' } },
        { paymentStatus: { $regex: searchKeyword, $options: 'i' } },
        { paymentMethod: { $regex: searchKeyword, $options: 'i' } },
        
      ];
    }

    
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

  
  private sanitizeDeliveryTypePricing(pricing: any): {
    instant: number;
    schedule: number;
  } {
    const sanitized: { instant?: number; schedule?: number } = {};

    
    if (pricing && typeof pricing === 'object') {
      if (typeof pricing.instant === 'number') {
        sanitized.instant = pricing.instant;
      }
      if (typeof pricing.schedule === 'number') {
        sanitized.schedule = pricing.schedule;
      }
    }

    
    if (!sanitized.instant || sanitized.instant === 0) {
      sanitized.instant = 1000;
    }
    if (!sanitized.schedule || sanitized.schedule === 0) {
      sanitized.schedule = 800; 
    }

    return sanitized as { instant: number; schedule: number };
  }

  
  private async getOrCreateOrderSettings(): Promise<OrderSetting> {
    let settings = await this.orderSettingRepo.findOne({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });

    if (!settings) {
      
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
          schedule: 800, 
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
      
      const originalPricing = settings.deliveryTypePricing;
      const sanitizedPricing =
        this.sanitizeDeliveryTypePricing(originalPricing);

      
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
          schedule: 800, 
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
      
      Object.assign(settings, updateData);

      
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

    
    Object.assign(existingOrder, payload);
    const updatedOrder = await this.orderRepo.save(existingOrder);

    
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

        
        await this.handleOrderCompletion(orderWithRelations);

        
        try {
          await this.generateAndSendReceipt(orderWithRelations);
        } catch (receiptError) {
          console.error('Error generating receipt:', receiptError);
          
        }
      } catch (error) {
        console.error('Error handling order completion:', error);
        
      }
    }

    if (orderWithRelations && orderWithRelations.userId) {
      try {
        await this.sendOrderStatusNotification(orderWithRelations, payload);
      } catch (error) {
        console.error('Error sending order status notification:', error);
      }
    }

    
    return orderWithRelations
      ? this.serializeOrder(orderWithRelations)
      : updatedOrder;
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

      
      const orderSettings = await this.getOrCreateOrderSettings();
      const orderPercentage = orderSettings.orderPercentage || 10; 

      
      const orderAmountNum = Number(order.amount);
      const percentageAmount = (orderAmountNum * orderPercentage) / 100;

      
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
        return; 
      }

      console.log('[ORDER_COMPLETION] Driver ID extracted:', driverId);

      
      const driver = await this.userRepo.findOne({
        where: { id: driverId, role: 'rider' as any },
      });

      if (!driver || !driver.id) {
        console.error('[ORDER_COMPLETION] Driver not found:', driverId);
        return; 
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

      
      const commissionReference = `TXN-COMM-${generateOTP(12, false)}-${Date.now()}`;

      
      
      if (order.paymentMethod === 'cash') {
        
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
        
        return;
      } else {
        
        try {
          await this.walletService.debitWallet(
            finalDriverId,
            percentageAmount,
            'Platform fee deduction',
          );
          console.log(
            '[ORDER_COMPLETION] Commission deducted from driver wallet',
          );

          
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
          throw error; 
        }

        
        const riderAmount = orderAmountNum - percentageAmount;

        try {
          
          await this.walletService.creditWallet(
            finalDriverId,
            riderAmount,
            'Order payment earnings',
          );
          console.log('[ORDER_COMPLETION] Rider wallet credited:', riderAmount);

          
          const fundingReference = `TXN-EARN-${generateOTP(12, false)}-${Date.now()}`;

          
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
      
    }
  }

  
  
  
  
  
  
  

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
      const maxDistance = 20 * 1000; 

      
      
      
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
      const maxDistanceKm = 20; 
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);

      if (isNaN(lat) || isNaN(lng)) {
        throw new HttpException(
          'Invalid latitude or longitude provided',
          HttpStatus.BAD_REQUEST,
        );
      }

      
      const orders = await this.orderRepo
        .createQueryBuilder('order')
        .where('order.status = :status', { status })
        .andWhere('order.pickupCoordinates IS NOT NULL')
        .orderBy('order.createdAt', 'DESC')
        .getMany();

      
      const parsePointString = (
        pointString: string,
      ): { lat: number; lng: number } | null => {
        try {
          
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

      
      const calculateDistance = (
        lat1: number,
        lng1: number,
        lat2: number,
        lng2: number,
      ): number => {
        const R = 6371; 
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
        .sort((a, b) => a.distance - b.distance) 
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

    
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    const driver = await this.userRepo.findOne({
      where: { id: driverId, role: 'rider' as any },
    });

    if (!order || !driver) {
      throw new NotFoundException('Order or Driver not found');
    }

    
    const parsePoint = (pointStr: string): [number, number] | null => {
      if (!pointStr) return null;
      const match = pointStr.match(/POINT\(([^ ]+) ([^ ]+)\)/);
      if (match) {
        return [parseFloat(match[1]), parseFloat(match[2])]; 
      }
      return null;
    };

    
    if (!order.pickupCoordinates || !order.deliveryCoordinates) {
      throw new HttpException(
        'Order pickup or delivery coordinates not available',
        HttpStatus.BAD_REQUEST,
      );
    }

    
    const pickupCoords = parsePoint(order.pickupCoordinates);
    const deliveryCoords = parsePoint(order.deliveryCoordinates);

    if (!pickupCoords || !deliveryCoords) {
      throw new HttpException(
        'Invalid coordinates format',
        HttpStatus.BAD_REQUEST,
      );
    }

    
    
    
    const driverLat = 0; 
    const driverLng = 0; 
    const driverLatLng = `${driverLat},${driverLng}`;

    
    const pickupLatLng = `${pickupCoords[1]},${pickupCoords[0]}`; 
    const deliveryLatLng = `${deliveryCoords[1]},${deliveryCoords[0]}`; 

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
          distance: toPickup.rows[0].elements[0].distance.value / 1000, 
          eta: toPickup.rows[0].elements[0].duration.value / 60, 
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

  
  
  
  
  watchOrderStatusChange(io: Server) {
    
    
    
    
    
    
    console.warn(
      'watchOrderStatusChange: MongoDB change streams not available in PostgreSQL. This needs re-implementation.',
    );
  }
  

  
  
  

  
  
  

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  

  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  

  
  

  async createMultipleOrders(payload: any) {
    const results = [];
    for (const delivery of payload.deliveries) {
      
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

        
        const normalizedTypeRaw = (payload.deliveryType || 'instant')
          .toString()
          .toLowerCase();
        const normalizedDeliveryType =
          normalizedTypeRaw === 'schedule' ? 'schedule' : 'instant';

        
        const perKmConfig = (orderSettings as any).perKmPricing || {};
        const perKm =
          typeof perKmConfig.normal === 'number'
            ? perKmConfig.normal
            : costPerKm;

        
        const calculatedCost = distance * perKm;
        const baseCost = Math.ceil(Math.max(minCost, calculatedCost));

        
        let deliveryTypeCost = 0;
        const typeCost = deliveryTypePricing[normalizedDeliveryType];
        if (typeof typeCost === 'number' && typeCost > 0) {
          deliveryTypeCost = typeCost;
        }

        
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

    
    const instantResult = await this.calculateCost({
      ...basePayload,
      deliveryType: 'instant',
      traffic: traffic.level,
      weather: weather.condition,
    });

    
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

    
    const userId = user.id || user.sub || user._id?.toString();
    if (!userId) {
      throw new HttpException('User ID not found', HttpStatus.BAD_REQUEST);
    }

    
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
        
        const riderUserId = driver.id?.toString();
        
        const orderUser = order.user;
        let userId: string | undefined;

        if (orderUser) {
          
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
          
          await this.updateOrder(orderId, {
            paymentStatus: 'SUCCESSFUL',
          });
        }
      }
    } catch (paymentError) {
      
      console.error(
        'Error processing payment on order acceptance:',
        paymentError,
      );
    }

    
    const driverInfo = driver
      ? {
          id: driver.id,
          firstName: driver.firstName,
          lastName: driver.lastName,
          phoneNumber: driver.phoneNumber,
          email: driver.email,
          averageRating: driver.averageRating,
          selfie: driver.profileImage?.url || null, 
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

    
    try {
      if (newOrder.user && driver) {
        await this.mailService.sendOrderAcceptedEmail(
          newOrder,
          newOrder.user,
          driver,
        );
        
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

    
    if (order.paymentStatus === 'SUCCESSFUL') {
      
      if (order.paymentMethod === 'wallet') {
        const userId =
          typeof order.user === 'object' && '_id' in order.user
            ? (order.user as any)._id?.toString()
            : order.user?.toString();
        if (userId) {
          await this.walletService.creditWallet(userId, Number(order.amount));
        }
      } else if (order.paymentMethod === 'card') {
        
        try {
          
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

      
      if (order.driverId && order.paymentMethod !== 'cash') {
        try {
          
          
          let driverId: string;
          if (order.driverId) {
            driverId = order.driverId.toString();
          } else if (order.driver) {
            
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

          
          const driverUser =
            await this.driverService.getDriverProfile(driverId);
          if (driverUser && driverUser.id) {
            
            const limitAmount = await this.paymentService.getBalanceLimit();
            await this.walletService.debitWallet(
              driverUser.id.toString(),
              Number(order.amount),
              'Order cancellation - reversing earnings',
              true, 
              limitAmount, 
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

      
      await this.walletService.debitWallet(
        userId,
        order.amount,
        'Order payment via wallet',
      );

      
      const transactionReference = `WAL-${generateOTP(12, false)}`;

      
      await this.paymentService.createTransaction({
        user: userId, 
        orderId: orderId,
        amount: order.amount,
        reference: transactionReference,
        narration: 'Order payment via wallet',
        status: PaymentTransactionStatus.SUCCESSFUL as any,
        isVerified: true,
        type: PaymentTransactionType.DEBIT as any,
        verifiedAt: new Date(),
      });

      
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
      
      throw new HttpException(
        error.message || 'Failed to process wallet payment',
        HttpStatus.BAD_REQUEST,
      );
    }

    
    const updatedOrder = await this.updateOrder(orderId, {
      paymentStatus: 'SUCCESSFUL',
      paymentMethod: 'wallet',
      paidAt: new Date(),
    });

    
    if (updatedOrder && updatedOrder.driver) {
      try {
        
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

    
    const userId = user.id || user.sub || user._id?.toString();
    if (!userId) {
      throw new HttpException('User ID not found', HttpStatus.BAD_REQUEST);
    }

    const payload = {
      status: 'started',
      startTime: new Date(),
    };
    const newOrder = await this.updateOrder(orderId, payload);

    
    try {
      if (newOrder.user && newOrder.driver) {
        await this.mailService.sendOrderStartedEmail(
          newOrder,
          newOrder.user,
          newOrder.driver,
        );
        
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

    
    const userId = user.id || user.sub || user._id?.toString();
    if (!userId) {
      throw new HttpException('User ID not found', HttpStatus.BAD_REQUEST);
    }

    const payload = {
      status: 'completed',
      completeTime: new Date(),
    };
    const newOrder = await this.updateOrder(orderId, payload);

    
    await this.handleOrderCompletion(newOrder);

    
    try {
      if (newOrder.user && newOrder.driver) {
        await this.mailService.sendOrderCompletedEmail(
          newOrder,
          newOrder.user,
          newOrder.driver,
        );
        
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
      
    }

    return {
      success: true,
      message: 'Order completed successfully',
      data: newOrder,
    };
  }

  async assignOrderToRider(orderId: string, riderId: string, user: any) {
    
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

    
    if (order.status !== 'new' && order.status !== 'assigned') {
      throw new HttpException(
        `Order cannot be assigned as it is in '${order.status}' status`,
        HttpStatus.BAD_REQUEST,
      );
    }

    
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

    
    const payload = {
      driverId: normalizedRiderId,
      status: 'assigned',
    };
    const updatedOrder = await this.updateOrder(normalizedOrderId, payload);

    
    try {
      if (updatedOrder.user && updatedOrder.driver) {
        await this.mailService.sendOrderAssignedEmail(
          updatedOrder,
          updatedOrder.user,
          updatedOrder.driver,
        );
        
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
      
    }

    return {
      success: true,
      message: 'Order assigned to rider successfully',
      data: updatedOrder,
    };
  }

  async rejectAssignedOrder(orderId: string, rider: any) {
    
    const riderId = rider.id || rider.sub || rider._id?.toString();
    if (!riderId) {
      throw new HttpException('Rider ID not found', HttpStatus.BAD_REQUEST);
    }

    
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

    
    if (order.driverId !== riderId) {
      throw new HttpException(
        'This order is not assigned to you',
        HttpStatus.FORBIDDEN,
      );
    }

    
    if (order.status !== 'assigned') {
      throw new HttpException(
        `Order cannot be rejected as it is in '${order.status}' status`,
        HttpStatus.BAD_REQUEST,
      );
    }

    
    const riderInfo = order.driver;
    const userInfo = order.user;

    
    const payload = {
      driverId: null,
      status: 'new',
    };
    const updatedOrder = await this.updateOrder(orderId, payload);

    
    try {
      if (userInfo && riderInfo) {
        await this.mailService.sendOrderRejectedEmail(
          order,
          userInfo,
          riderInfo,
        );
        
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
      
    }

    return {
      success: true,
      message: 'Order assignment rejected successfully',
      data: updatedOrder,
    };
  }

  async getAssignedOrders(riderId: string, status?: string) {
    const whereClause: any = { driverId: riderId?.toString() };

    
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

    
    const serializedOrders = orders.map((order) => this.serializeOrder(order));

    return {
      success: true,
      message: 'Assigned orders fetched successfully',
      data: serializedOrders,
    };
  }

  
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

  
  async generateReceiptForOrder(
    orderId: string,
    requestingUser: any,
  ): Promise<{ success: boolean; message: string }> {
    
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

    
    if (order.status !== 'completed') {
      throw new BadRequestException(
        'Receipt can only be generated for completed orders',
      );
    }

    
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

      
      const receiptPDF = await this.receiptService.generateReceiptPDF(
        order,
        order.user,
        order.driver || null,
      );

      
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
