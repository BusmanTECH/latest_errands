import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Put,
  UseGuards,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CostResponseDto,
  MultipleCostResponseDto,
} from './dto/cost.response.dto';
import { OrderSettingResponseDto } from './dto/orderSettings.response.dto';
import { OrderService } from './order.service';
import { costDto, multipleCostDto } from './dto/cost.dto';
import { locationDto } from './dto/location.dto';
import {
  UpdateOrderSettingsDto,
  CreateOrderSettingsDto,
} from './dto/orderSettings.dto';
import { AssignOrderDto } from './dto/order.dto';
import { Users } from '../decorators/user.decorator';
import { AdminGuard } from '../guards/admin.guard';

// Alias for backward compatibility
const AuthUser = Users;

@ApiTags('order')
@Controller('order')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post('/get_cost')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Calculate cost with traffic and weather' })
  @ApiOkResponse({ type: CostResponseDto })
  async getCost(@Body() body: costDto, @Res() res: Response) {
    try {
      const result = await this.orderService.getCostWithTrafficWeather(body);
      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to calculate order cost',
      });
    }
  }

  @Post('/compare_pricing')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Compare instant vs schedule pricing side-by-side' })
  async comparePricing(@Body() body: costDto, @Res() res: Response) {
    try {
      const result =
        await this.orderService.comparePricingWithTrafficWeather(body);
      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to compare pricing',
      });
    }
  }

  @Post('/get_multiple_cost')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Calculate costs for multiple drop-offs' })
  @ApiOkResponse({ type: MultipleCostResponseDto })
  async getMultipleCost(@Body() body: multipleCostDto, @Res() res: Response) {
    try {
      const payload: any = {
        pickupCoordinates: `${body.pickupCoords.latitude},${body.pickupCoords.longitude}`,
        deliveryCoords: body.deliveryCoords,
        deliveryType: body.deliveryType || 'instant',
        // mode: body.vehicle
      };
      const result = await this.orderService.calculateMultipleCost(payload);
      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to calculate multiple costs',
      });
    }
  }

  @Post('/')
  @UseGuards(AuthGuard('jwt'))
  async order(@AuthUser() user: any, @Body() body: any, @Res() res: Response) {
    try {
      // If deliveries array is present, treat as multiple order
      if (Array.isArray(body.deliveries) && body.deliveries.length > 0) {
        const result = await this.orderService.createMultipleOrders({
          ...body,
          user,
        });
        return res.status(HttpStatus.OK).json(result);
      } else {
        const data = await this.orderService.prepareOrderData(body, user);
        const result = await this.orderService.createOrder(data);
        return res.status(HttpStatus.CREATED).json(result);
      }
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to create order',
      });
    }
  }

  @Get('/user-orders')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Get orders for authenticated user with optional status filter',
  })
  async getMyOrders(
    @Query('page') page: number,
    @Query('status') orderStatus: string,
    @AuthUser() user: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.orderService.myOrders(user, orderStatus);
      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      const httpStatus = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(httpStatus).json({
        success: false,
        message: error.message || 'Failed to fetch orders',
      });
    }
  }

  @Get('/driver-orders')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Get orders for authenticated driver with optional status filter',
  })
  async getMyDriverOrders(
    @Query('status') orderStatus: string,
    @AuthUser() user: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.orderService.myDriverOrders(user, orderStatus);
      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      const httpStatus = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(httpStatus).json({
        success: false,
        message: error.message || 'Failed to fetch driver orders',
      });
    }
  }

  @Get('/driver_orders/:driverId')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary:
      'Get orders for a specific driver by ID with optional status filter',
  })
  async getDriverOrders(
    @Param('driverId') driverId: string,
    @Query('status') orderStatus: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.orderService.driverOrders(
        driverId,
        orderStatus,
      );
      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      const httpStatus = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(httpStatus).json({
        success: false,
        message: error.message || 'Failed to fetch driver orders',
      });
    }
  }

  @Get('/user_orders/:userId')
  @UseGuards(AuthGuard('jwt'))
  async getUserOrders(@Param('userId') userId: string, @Res() res: Response) {
    try {
      const result = await this.orderService.userOrders(userId);
      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to fetch user orders',
      });
    }
  }

  @Get('/single-order')
  async getSingleOrder(@Query('id') id: string, @Res() res: Response) {
    try {
      if (!id) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Order ID is required',
        });
      }
      const order = await this.orderService.findOne(id);
      if (!order) {
        return res.status(HttpStatus.NOT_FOUND).json({
          success: false,
          message: 'Order not found',
        });
      }
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Order fetched successfully',
        data: order,
      });
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to fetch order',
      });
    }
  }

  @Get('/order-by-trackingCode')
  async findOrderByTrackCode(
    @Query('trackingCode') trackingCode: string,
    @Res() res: Response,
  ) {
    try {
      if (!trackingCode) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Tracking code is required',
        });
      }
      const result = await this.orderService.findOrderByTrackCode(trackingCode);
      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      const status = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(status).json({
        success: false,
        message: error.message || 'Failed to find order by tracking code',
      });
    }
  }

  @Post('/save-location')
  @UseGuards(AuthGuard('jwt'))
  async saveLocation(@AuthUser() user: any, @Body() body: locationDto) {
    try {
      const data = {
        ...body,
        user,
      };
      return this.orderService.saveLocation(data);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to save location',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/my-locations')
  @UseGuards(AuthGuard('jwt'))
  async myLocationss(@AuthUser() user: any) {
    try {
      const userId = user.id || user.sub || user._id;
      if (!userId) {
        throw new HttpException('User ID not found', HttpStatus.BAD_REQUEST);
      }
      return this.orderService.fetchMyLocation(userId);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch locations',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/nearby-delivery-drivers')
  @UseGuards(AuthGuard('jwt'))
  async findDeliveryDriver(
    @AuthUser() user: any,
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
  ) {
    try {
      if (!latitude || !longitude) {
        throw new HttpException(
          'Latitude and longitude are required',
          HttpStatus.BAD_REQUEST,
        );
      }
      return this.orderService.findDeliveryRiders(latitude, longitude);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to find nearby drivers',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/nearby-orders')
  async findNearbyOrder(
    @Query('latitude') latitude: string,
    @Query('longitude') longitude: string,
  ) {
    try {
      if (!latitude || !longitude) {
        throw new HttpException(
          'Latitude and longitude are required',
          HttpStatus.BAD_REQUEST,
        );
      }
      const orders = await this.orderService.findNearbyOrder(
        latitude,
        longitude,
      );
      return {
        success: true,
        message: 'Nearby orders fetched successfully',
        data: orders,
      };
    } catch (error) {
      console.error('Error finding nearby orders:', error);
      throw new HttpException(
        error.message || 'Failed to find nearby orders',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/accept-order')
  @UseGuards(AuthGuard('jwt'))
  async acceptOrder(@AuthUser() user: any, @Query('orderId') id: string) {
    try {
      return await this.orderService.acceptOrderWithValidation(id, user);
    } catch (error) {
      throw new HttpException(
        error.message || 'An error occurred while accepting the order',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/start-order')
  @UseGuards(AuthGuard('jwt'))
  async startOrder(@AuthUser() user: any, @Query('orderId') id: string) {
    try {
      return await this.orderService.startOrderWithValidation(id, user);
    } catch (error) {
      throw new HttpException(
        error.message || 'An error occurred while starting the order',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/cancel-order')
  @UseGuards(AuthGuard('jwt'))
  async cancelOrder(@AuthUser() user: any, @Query('orderId') id: string) {
    try {
      return await this.orderService.cancelOrderWithRefund(id, user);
    } catch (error) {
      throw new HttpException(
        error.message || 'An error occurred while cancelling the order',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/complete-order')
  @UseGuards(AuthGuard('jwt'))
  async completeOrder(@AuthUser() user: any, @Query('orderId') id: string) {
    try {
      return await this.orderService.completeOrderWithValidation(id, user);
    } catch (error) {
      throw new HttpException(
        error.message || 'An error occurred while completing the order',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/to-destination')
  @UseGuards(AuthGuard('jwt'))
  async toDestination(@AuthUser() user: any, @Query('orderId') id: string) {
    try {
      const payload = {
        status: 'toDestination',
        // completeTime: new Date()
      };
      const newOrder = await this.orderService.updateOrder(id, payload);
      // Emit WebSocket event

      return {
        success: true,
        message: 'Successfully',
        data: newOrder,
      };
    } catch (error) {
      // Handle other errors
      throw new HttpException(
        error.message || 'An error occurred while completing the order',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('/pay-with-wallet')
  @UseGuards(AuthGuard('jwt'))
  async payWithWallet(
    @AuthUser() user: any,
    @Body() body: { orderId: string },
  ) {
    try {
      return await this.orderService.payWithWalletLogic(body.orderId, user);
    } catch (error) {
      throw new HttpException(
        error.message || 'An error occurred while processing wallet payment',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('/assign')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Assign order to a specific rider' })
  async assignOrder(@AuthUser() user: any, @Body() body: AssignOrderDto) {
    try {
      return await this.orderService.assignOrderToRider(
        body.orderId,
        body.riderId,
        user,
      );
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to assign order to rider',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('/reject-assigned')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Reject an assigned order (Rider only)' })
  async rejectAssignedOrder(
    @AuthUser() user: any,
    @Query('orderId') orderId: string,
  ) {
    try {
      if (!orderId) {
        throw new HttpException('Order ID is required', HttpStatus.BAD_REQUEST);
      }

      // Validate user has 'rider' role
      const userRole = user?.role?.toLowerCase() || user?.role;
      if (userRole !== 'rider') {
        throw new HttpException(
          'Only riders can reject assigned orders',
          HttpStatus.FORBIDDEN,
        );
      }

      return await this.orderService.rejectAssignedOrder(orderId, user);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to reject assigned order',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/assigned')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Get assigned orders for authenticated rider' })
  async getAssignedOrders(
    @AuthUser() user: any,
    @Query('status') status?: string,
  ) {
    try {
      // Validate user has 'rider' role
      const userRole = user?.role?.toLowerCase() || user?.role;
      if (userRole !== 'rider') {
        throw new HttpException(
          'Only riders can view assigned orders',
          HttpStatus.FORBIDDEN,
        );
      }

      const riderId = user.id || user.sub || user._id?.toString();
      if (!riderId) {
        throw new HttpException('Rider ID not found', HttpStatus.BAD_REQUEST);
      }

      return await this.orderService.getAssignedOrders(riderId, status);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch assigned orders',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ===================================ADMIN ORDER ENDPOINTS========================

  @Get('/all_orders')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  async getAllOrderAdmin(@Query('page') page: number, @Query() query: any) {
    try {
      const { page: _, ...filters } = query; // Exclude 'page' from filters
      const orders = await this.orderService.allOrders(page || 1, filters);

      return {
        success: true,
        message: 'Orders fetched successfully',
        data: orders,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch all orders',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('/admin/update_order/:orderId')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  async adminUpdateOrder(@Body() data: any, @Param('orderId') id: string) {
    try {
      if (!id) {
        throw new HttpException('Order ID is required', HttpStatus.BAD_REQUEST);
      }
      const order = await this.orderService.updateOrder(id, data);

      return {
        success: true,
        message: 'Order updated successfully',
        data: order,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to update order',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Admin endpoints for order settings
  @Get('/admin/settings')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @ApiOperation({ summary: 'Get current pricing settings (Admin)' })
  @ApiOkResponse({ type: OrderSettingResponseDto })
  async getAdminSettings(@AuthUser() user: any) {
    try {
      console.log('getAdminSettings - User:', user);
      return this.orderService.getCurrentOrderSettings();
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch settings',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Public endpoint to fetch current pricing/settings (first/active)
  @Get('/settings')
  @ApiOperation({ summary: 'Fetch current pricing settings (public)' })
  @ApiOkResponse({ type: OrderSettingResponseDto })
  async getCurrentSettings() {
    try {
      return this.orderService.getCurrentOrderSettings();
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch settings',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('/admin/settings')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @ApiOperation({ summary: 'Update current pricing settings' })
  @ApiOkResponse({ type: OrderSettingResponseDto })
  async updateAdminSettings(
    @Body() updateData: UpdateOrderSettingsDto,
    @AuthUser() user: any,
  ) {
    try {
      console.log('updateAdminSettings - User:', user);
      console.log('updateAdminSettings - Update Data:', updateData);
      return this.orderService.updateCurrentOrderSettings(updateData);
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to update settings',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('/:id/receipt')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Generate and send receipt for completed order',
    description:
      'Generates a PDF receipt and sends it via email. Accessible by order owner, assigned driver, or admin.',
  })
  async generateReceipt(
    @Param('id') orderId: string,
    @AuthUser() user: any,
    @Res() res: Response,
  ) {
    try {
      const result = await this.orderService.generateReceiptForOrder(
        orderId,
        user,
      );
      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      const httpStatus = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(httpStatus).json({
        success: false,
        message: error.message || 'Failed to generate receipt',
      });
    }
  }
}
