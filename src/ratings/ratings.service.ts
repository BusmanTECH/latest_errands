/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rating } from './entities/rating.entity';
import { Order } from '../order/entities/order.entity';
import { User } from '../auth/entities/user.entity';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UserRole } from '../auth/entities/user.entity';
import { RatedUserRole } from './entities/rating.entity';

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(Rating)
    private readonly ratingRepo: Repository<Rating>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async createRating(dto: CreateRatingDto, rater: any): Promise<Rating> {
    /**
     * HOW THE SYSTEM IDENTIFIES WHO IS BEING RATED:
     * 
     * 1. WHO IS GIVING THE RATING (The Rater):
     *    - Extracted from JWT token via @AuthUser() decorator
     *    - Contains: { id, sub, role } from authenticated user
     *    - No need to specify in request body - automatically extracted
     * 
     * 2. WHO IS BEING RATED (The Rated User):
     *    - Determined automatically based on:
     *      a. Rater's role (from JWT token: USER, CUSTOMER, or RIDER)
     *      b. Order's userId and driverId (from order entity)
     * 
     * 3. LOGIC:
     *    - IF rater.role === "RIDER" or "DRIVER":
     *        → ratedUserId = order.userId (the customer who created the order)
     *        → ratedUserRole = "user"
     *    
     *    - IF rater.role === "USER" or "CUSTOMER":
     *        → ratedUserId = order.driverId (the driver who completed the order)
     *        → ratedUserRole = "driver"
     * 
     * Example:
     * - Customer (role: USER) submits rating → automatically rates the Driver (order.driverId)
     * - Driver (role: RIDER) submits rating → automatically rates the Customer (order.userId)
     */

    // Find the order
    const order = await this.orderRepo.findOne({
      where: { id: dto.orderId },
      relations: ['user', 'driver'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Check if order is completed
    if (order.status !== 'completed') {
      throw new BadRequestException(
        'You can only rate orders that are completed',
      );
    }

    // Get rater ID from JWT token - handle both User entity and JWT payload format
    const raterId = (rater as any).id || (rater as any).sub || (rater as any)._id;
    if (!raterId) {
      throw new BadRequestException('Rater ID not found');
    }

    // Get rater role from JWT token - normalize to handle enum values and string comparisons
    const raterRole = (rater.role || '').toLowerCase();
    let ratedUserId: string;
    let ratedUserRole: RatedUserRole;

    // Determine who is being rated based on rater's role
    // BIDIRECTIONAL RATING SYSTEM:
    // - If RIDER/DRIVER rates → rates the USER/CUSTOMER (affects user's profile rating)
    // - If USER/CUSTOMER rates → rates the RIDER/DRIVER (affects driver's profile rating)
    if (raterRole === UserRole.RIDER.toLowerCase() || raterRole === 'driver') {
      // Driver/Rider is rating the user/customer
      // Since rater is a driver, they rate the customer (order.userId)
      if (!order.userId) {
        throw new BadRequestException('Order user not found');
      }
      ratedUserId = order.userId;
      ratedUserRole = RatedUserRole.USER;
    } else if (raterRole === UserRole.USER.toLowerCase() || raterRole === UserRole.CUSTOMER.toLowerCase()) {
      // User/Customer is rating the driver/rider
      // Since rater is a customer, they rate the driver (order.driverId)
      if (!order.driverId) {
        throw new BadRequestException('Order driver not found');
      }
      ratedUserId = order.driverId;
      ratedUserRole = RatedUserRole.DRIVER;
    } else {
      throw new BadRequestException(`Invalid user role for rating: ${raterRole}. Only users and riders can rate each other.`);
    }

    // Check if rater is part of this order
    if (
      raterId.toString() !== order.userId?.toString() &&
      raterId.toString() !== order.driverId?.toString()
    ) {
      throw new BadRequestException(
        'You can only rate orders you are associated with',
      );
    }

    // Check if rating already exists for this order by this rater
    const existingRating = await this.ratingRepo.findOne({
      where: {
        orderId: dto.orderId,
        raterId: raterId.toString(),
      },
    });

    if (existingRating) {
      throw new BadRequestException(
        'You have already rated this order. You can update your rating instead.',
      );
    }

    // Create the rating
    const rating = this.ratingRepo.create({
      orderId: dto.orderId,
      raterId: raterId.toString(),
      ratedUserId: ratedUserId.toString(),
      rating: dto.rating,
      comment: dto.comment,
      ratedUserRole,
    });

    const savedRating = await this.ratingRepo.save(rating);

    // Update average rating for the rated user (affects their profile rating)
    // This updates the averageRating field in the User entity, which is displayed
    // in both user and driver profiles via getUserProfile() and getDriverProfile()
    await this.updateAverageRating(ratedUserId.toString());

    return savedRating;
  }

  async updateRating(
    ratingId: string,
    dto: Partial<CreateRatingDto>,
    rater: any,
  ): Promise<Rating> {
    const rating = await this.ratingRepo.findOne({
      where: { id: ratingId },
      relations: ['ratedUser'],
    });

    if (!rating) {
      throw new NotFoundException('Rating not found');
    }

    // Check if rater owns this rating - handle both User entity and JWT payload format
    const raterId = (rater as any).id || (rater as any).sub || (rater as any)._id;
    if (rating.raterId !== raterId?.toString()) {
      throw new BadRequestException('You can only update your own ratings');
    }

    // Update rating fields
    if (dto.rating !== undefined) {
      if (dto.rating < 1 || dto.rating > 5) {
        throw new BadRequestException('Rating must be between 1 and 5');
      }
      rating.rating = dto.rating;
    }

    if (dto.comment !== undefined) {
      rating.comment = dto.comment;
    }

    const updatedRating = await this.ratingRepo.save(rating);

    // Update average rating for the rated user
    await this.updateAverageRating(rating.ratedUserId);

    return updatedRating;
  }

  async getRatingsForUser(userId: string): Promise<Rating[]> {
    return await this.ratingRepo.find({
      where: { ratedUserId: userId },
      relations: ['rater', 'rater.profileImage', 'order'],
      order: { createdAt: 'DESC' },
    });
  }

  async getRatingsByUser(raterId: string): Promise<Rating[]> {
    return await this.ratingRepo.find({
      where: { raterId },
      relations: ['ratedUser', 'ratedUser.profileImage', 'order'],
      order: { createdAt: 'DESC' },
    });
  }

  async getRatingForOrder(orderId: string, raterId: string): Promise<Rating | null> {
    return await this.ratingRepo.findOne({
      where: { orderId, raterId },
      relations: ['rater', 'ratedUser', 'order'],
    });
  }

  private async updateAverageRating(userId: string): Promise<void> {
    // Get all ratings for this user (both as a user and as a driver)
    // This ensures that whether the user is rated as a customer or as a driver,
    // their profile averageRating is updated correctly
    const ratings = await this.ratingRepo.find({
      where: { ratedUserId: userId },
    });

    if (ratings.length === 0) {
      // If no ratings, set default to 4.0
      await this.userRepo.update(userId, { averageRating: 4.0 });
      return;
    }

    // Calculate average from all ratings received
    const totalRating = ratings.reduce((sum, rating) => {
      return sum + Number(rating.rating);
    }, 0);

    const averageRating = totalRating / ratings.length;
    const roundedAverage = Math.round(averageRating * 100) / 100; // Round to 2 decimal places

    // Update the user's average rating in the User entity
    // This averageRating is used in both getUserProfile() and getDriverProfile()
    // to display the user's overall rating, regardless of whether they're a customer or driver
    await this.userRepo.update(userId, {
      averageRating: roundedAverage,
    });
  }

  async deleteRating(ratingId: string, rater: any): Promise<void> {
    const rating = await this.ratingRepo.findOne({
      where: { id: ratingId },
    });

    if (!rating) {
      throw new NotFoundException('Rating not found');
    }

    // Check if rater owns this rating - handle both User entity and JWT payload format
    const raterId = (rater as any).id || (rater as any).sub || (rater as any)._id;
    if (rating.raterId !== raterId?.toString()) {
      throw new BadRequestException('You can only delete your own ratings');
    }

    const ratedUserId = rating.ratedUserId;

    // Delete the rating
    await this.ratingRepo.remove(rating);

    // Update average rating for the rated user
    await this.updateAverageRating(ratedUserId);
  }
}
