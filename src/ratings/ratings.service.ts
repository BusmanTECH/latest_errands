
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
    

    
    const order = await this.orderRepo.findOne({
      where: { id: dto.orderId },
      relations: ['user', 'driver'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    
    if (order.status !== 'completed') {
      throw new BadRequestException(
        'You can only rate orders that are completed',
      );
    }

    
    const raterId = (rater as any).id || (rater as any).sub || (rater as any)._id;
    if (!raterId) {
      throw new BadRequestException('Rater ID not found');
    }

    
    const raterRole = (rater.role || '').toLowerCase();
    let ratedUserId: string;
    let ratedUserRole: RatedUserRole;

    
    
    
    
    if (raterRole === UserRole.RIDER.toLowerCase() || raterRole === 'driver') {
      
      
      if (!order.userId) {
        throw new BadRequestException('Order user not found');
      }
      ratedUserId = order.userId;
      ratedUserRole = RatedUserRole.USER;
    } else if (raterRole === UserRole.USER.toLowerCase() || raterRole === UserRole.CUSTOMER.toLowerCase()) {
      
      
      if (!order.driverId) {
        throw new BadRequestException('Order driver not found');
      }
      ratedUserId = order.driverId;
      ratedUserRole = RatedUserRole.DRIVER;
    } else {
      throw new BadRequestException(`Invalid user role for rating: ${raterRole}. Only users and riders can rate each other.`);
    }

    
    if (
      raterId.toString() !== order.userId?.toString() &&
      raterId.toString() !== order.driverId?.toString()
    ) {
      throw new BadRequestException(
        'You can only rate orders you are associated with',
      );
    }

    
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

    
    const rating = this.ratingRepo.create({
      orderId: dto.orderId,
      raterId: raterId.toString(),
      ratedUserId: ratedUserId.toString(),
      rating: dto.rating,
      comment: dto.comment,
      ratedUserRole,
    });

    const savedRating = await this.ratingRepo.save(rating);

    
    
    
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

    
    const raterId = (rater as any).id || (rater as any).sub || (rater as any)._id;
    if (rating.raterId !== raterId?.toString()) {
      throw new BadRequestException('You can only update your own ratings');
    }

    
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
    
    
    
    const ratings = await this.ratingRepo.find({
      where: { ratedUserId: userId },
    });

    if (ratings.length === 0) {
      
      await this.userRepo.update(userId, { averageRating: 4.0 });
      return;
    }

    
    const totalRating = ratings.reduce((sum, rating) => {
      return sum + Number(rating.rating);
    }, 0);

    const averageRating = totalRating / ratings.length;
    const roundedAverage = Math.round(averageRating * 100) / 100; 

    
    
    
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

    
    const raterId = (rater as any).id || (rater as any).sub || (rater as any)._id;
    if (rating.raterId !== raterId?.toString()) {
      throw new BadRequestException('You can only delete your own ratings');
    }

    const ratedUserId = rating.ratedUserId;

    
    await this.ratingRepo.remove(rating);

    
    await this.updateAverageRating(ratedUserId);
  }
}
