import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderSetting } from './entities/order-setting.entity';
import { Location } from './entities/location.entity';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { DriverService } from '../driver/driver.service';
import { ServicesModule } from '../services/services.module';
import { WalletModule } from '../wallet/wallet.module';
import { TrafficWeatherService } from './trafficWeather.service';
import { PaymentModule } from '../payment/payment.module';
import { PricingModule } from '../pricing/pricing.module';
import { AuthModule } from '../auth/auth.module';
import { TransactionModule } from '../transaction/transaction.module';
import { MailModule } from '../mail/mail.module';
import { NotificationModule } from '../notification/notification.module';
import { ReceiptModule } from '../receipt/receipt.module';
import { User } from '../auth/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderSetting, Location, User]),
    ServicesModule,
    WalletModule,
    forwardRef(() => PaymentModule),
    PricingModule,
    AuthModule, // For User entity access
    TransactionModule,
    MailModule,
    NotificationModule,
    ReceiptModule,
  ],
  controllers: [OrderController],
  providers: [OrderService, DriverService, TrafficWeatherService],
  exports: [OrderService],
})
export class OrderModule {}
