/* eslint-disable prettier/prettier */
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminGuard } from 'src/guards/admin.guard';
import { AdminService } from './admin.service';
import { OrderStatus } from '../order/entities/order.entity';
import { SendAdminNotificationDto } from './dto/send-admin-notification.dto';

@Controller('admin')
@UseGuards(AuthGuard('jwt'), AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ========== DASHBOARD ==========
  @Get('dashboard')
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  // ========== USER MANAGEMENT ==========
  @Get('users')
  async getAllUsers(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('search') search?: string,
  ) {
    return this.adminService.getAllUsers(page || 1, limit || 20, search);
  }

  @Get('users/:id')
  async getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Put('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() updateData: Partial<any>,
  ) {
    return this.adminService.updateUser(id, updateData);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  @Post('users/:id/approve')
  async approveUser(@Param('id') id: string) {
    return this.adminService.approveUser(id);
  }

  @Post('users/:id/reject')
  async rejectUser(@Param('id') id: string) {
    return this.adminService.rejectUser(id);
  }

  // ========== DRIVER MANAGEMENT ==========
  @Get('drivers')
  async getAllDrivers(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('search') search?: string,
  ) {
    return this.adminService.getAllDrivers(page || 1, limit || 20, search);
  }

  @Get('drivers/:id')
  async getDriverById(@Param('id') id: string) {
    return this.adminService.getDriverById(id);
  }

  @Post('drivers/:id/approve')
  async approveDriver(@Param('id') id: string) {
    return this.adminService.approveDriver(id);
  }

  @Post('drivers/:id/reject')
  async rejectDriver(@Param('id') id: string) {
    return this.adminService.rejectDriver(id);
  }

  @Post('drivers/:id/toggle-online')
  async toggleDriverOnlineStatus(@Param('id') id: string) {
    return this.adminService.toggleDriverOnlineStatus(id);
  }

  // ========== ORDER MANAGEMENT ==========
  @Get('orders')
  async getAllOrders(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('status') status?: OrderStatus,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getAllOrders(page || 1, limit || 20, {
      status,
      paymentStatus,
      search,
      startDate,
      endDate,
    });
  }

  @Get('orders/:id')
  async getOrderById(@Param('id') id: string) {
    return this.adminService.getOrderById(id);
  }

  @Put('orders/:id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body('status') status: OrderStatus,
  ) {
    return this.adminService.updateOrderStatus(id, status);
  }

  @Post('orders/:orderId/assign/:driverId')
  async assignOrderToDriver(
    @Param('orderId') orderId: string,
    @Param('driverId') driverId: string,
  ) {
    return this.adminService.assignOrderToDriver(orderId, driverId);
  }

  @Post('orders/:id/cancel')
  async cancelOrder(@Param('id') id: string) {
    return this.adminService.cancelOrder(id);
  }

  // ========== TRANSACTION MANAGEMENT ==========
  @Get('transactions')
  async getAllTransactions(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getAllTransactions(page || 1, limit || 20, {
      type,
      status,
      search,
      startDate,
      endDate,
    });
  }

  // ========== NOTIFICATION MANAGEMENT ==========
  @Post('notifications/send')
  async sendNotification(@Body() dto: SendAdminNotificationDto) {
    return this.adminService.sendAdminNotification(dto);
  }

  // ========== DELETED ACCOUNTS MANAGEMENT ==========
  @Get('deleted-accounts')
  async getDeletedAccounts(
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('search') search?: string,
  ) {
    return this.adminService.getDeletedAccounts(page || 1, limit || 20, search);
  }

  @Post('deleted-accounts/:id/restore')
  async restoreAccount(@Param('id') id: string) {
    return this.adminService.undeleteAccount(id);
  }
}
