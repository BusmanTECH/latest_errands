/* eslint-disable prettier/prettier */
import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { Users } from '../decorators/user.decorator';

const AuthUser = Users;

@ApiTags('ratings')
@Controller('ratings')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Post('/')
  @ApiOperation({
    summary: 'Submit a rating for an order',
    description:
      'Bidirectional rating system: Users/Customers rate Drivers/Riders, and Drivers/Riders rate Users/Customers. ' +
      'Ratings affect the profile averageRating of both users and drivers. Only completed orders can be rated.',
  })
  async createRating(
    @AuthUser() user: any,
    @Body() dto: CreateRatingDto,
    @Res() res: Response,
  ) {
    try {
      const rating = await this.ratingsService.createRating(dto, user);
      return res.status(HttpStatus.CREATED).json({
        success: true,
        message: 'Rating submitted successfully',
        data: rating,
      });
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to submit rating',
      });
    }
  }

  @Put('/:ratingId')
  @ApiOperation({
    summary: 'Update a rating',
    description: 'Update your own rating for an order',
  })
  async updateRating(
    @AuthUser() user: any,
    @Param('ratingId') ratingId: string,
    @Body() dto: Partial<CreateRatingDto>,
    @Res() res: Response,
  ) {
    try {
      const rating = await this.ratingsService.updateRating(ratingId, dto, user);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Rating updated successfully',
        data: rating,
      });
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to update rating',
      });
    }
  }

  @Get('/order/:orderId')
  @ApiOperation({
    summary: 'Get rating for a specific order',
    description: 'Get your rating for a specific order',
  })
  async getRatingForOrder(
    @AuthUser() user: any,
    @Param('orderId') orderId: string,
    @Res() res: Response,
  ) {
    try {
      const raterId = user.id || user.sub || user._id;
      if (!raterId) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'User ID not found',
        });
      }

      const rating = await this.ratingsService.getRatingForOrder(
        orderId,
        raterId.toString(),
      );

      if (!rating) {
        return res.status(HttpStatus.OK).json({
          success: true,
          message: 'No rating found for this order',
          data: null,
        });
      }

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Rating retrieved successfully',
        data: rating,
      });
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to get rating',
      });
    }
  }

  @Get('/my-ratings')
  @ApiOperation({
    summary: 'Get ratings I have given',
    description: 'Get all ratings given by the authenticated user',
  })
  async getMyRatings(@AuthUser() user: any, @Res() res: Response) {
    try {
      const raterId = user.id || user.sub || user._id;
      if (!raterId) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'User ID not found',
        });
      }

      const ratings = await this.ratingsService.getRatingsByUser(
        raterId.toString(),
      );

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Ratings retrieved successfully',
        data: ratings,
      });
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to get ratings',
      });
    }
  }

  @Get('/user/:userId')
  @ApiOperation({
    summary: 'Get ratings for a user',
    description: 'Get all ratings received by a specific user (rider or customer)',
  })
  async getRatingsForUser(
    @Param('userId') userId: string,
    @Res() res: Response,
  ) {
    try {
      const ratings = await this.ratingsService.getRatingsForUser(userId);

      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Ratings retrieved successfully',
        data: ratings,
      });
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to get ratings',
      });
    }
  }

  @Delete('/:ratingId')
  @ApiOperation({
    summary: 'Delete a rating',
    description: 'Delete your own rating',
  })
  async deleteRating(
    @AuthUser() user: any,
    @Param('ratingId') ratingId: string,
    @Res() res: Response,
  ) {
    try {
      await this.ratingsService.deleteRating(ratingId, user);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Rating deleted successfully',
      });
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to delete rating',
      });
    }
  }
}
