/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { User } from './auth/entities/user.entity';
import { Card } from './auth/entities/card.entity';
import { SmsModule } from './sms/sms.module';
import { DiverLicense } from './auth/entities/license.entity';
import { Nin } from './auth/entities/nin';

import { Vehicle } from './auth/entities/vehicle.entity';
import { ProfileImage } from './auth/entities/profile.entity';
import { plateNum } from './auth/entities/plateNum.entity';
import { LicenseImg } from './auth/entities/licenseImg.entity';
import { VehicleReg } from './auth/entities/VehicleReg.entity';
import { ChargesModule } from './charges/charges.module';
import { Charge } from './charges/entities/charge.entity';

import { AdminModule } from './admin/admin.module';
// import { ProfileModule } from './profile/profile.module';
import { UserModule } from './user/user.module';
import { DriverModule } from './driver/driver.module';
import { GeneralModule } from './general/general.module';
import { PricingModule } from './pricing/pricing.module';
import { PricingSettings } from './pricing/entities/pricing-settings.entity';
import { PaymentModule } from './payment/payment.module';
import { PaymentTransaction } from './payment/entities/payment-transaction.entity';
import { WalletModule } from './wallet/wallet.module';
import { Wallet } from './wallet/entities/wallet.entity';
import { TransactionModule } from './transaction/transaction.module';
import { Transaction } from './transaction/entities/transaction.entity';
import { OrderModule } from './order/order.module';
import { Order } from './order/entities/order.entity';
import { OrderSetting } from './order/entities/order-setting.entity';
import { Location } from './order/entities/location.entity';
import { CardModule } from './card/card.module';
import { NotificationModule } from './notification/notification.module';
import { Notification } from './notification/entities/notification.entity';
import { PushToken } from './notification/entities/push-token.entity';
import { RatingsModule } from './ratings/ratings.module';
import { Rating } from './ratings/entities/rating.entity';
import { WithdrawalRequest } from './wallet/entities/withdrawal-request.entity';
// import { RealtimeModule } from './realtime/realtime.module';
// import { OrdersFacadeModule } from './orders-facade/orders-facade.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DATABASE_HOST'),
        // host: configService.get<string>('DATABASE_DEV_HOST') || 'db', // Use 'db' as the default
        port: configService.get<number>('DATABASE_PORT'),
        username: configService.get<string>('DATABASE_USERNAME'),
        password: configService.get<string>('DATABASE_PASSWORD'),
        database: configService.get<string>('DATABASE_NAME'),
        entities: [
          User,
          Card,
          DiverLicense,
          Nin,

          Vehicle,
          ProfileImage,
          plateNum,
          LicenseImg,
          VehicleReg,

          Charge,
          PricingSettings,
          PaymentTransaction,
          Wallet,
          Transaction,
          Order,
          OrderSetting,
          Location,
          Notification,
          PushToken,
          Rating,
          WithdrawalRequest,
        ],
        synchronize: true,
        // Connection pool configuration
        extra: {
          max: 50, // Maximum number of clients in the pool
          min: 2, // Minimum number of clients in the pool
          idle_in_transaction_session_timeout: 30000, // Close idle connections after 30s
          connectionTimeoutMillis: 10000, // Connection timeout
          // Enable connection pooling properly
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000,
        },
        // migrations: ['src/migrations/*.ts'],
      }),
    }),
    AuthModule,
    SmsModule,

    ChargesModule,

    AdminModule,
    UserModule,
    DriverModule,
    GeneralModule,
    PricingModule,
    PaymentModule,
    WalletModule,
    TransactionModule,
    OrderModule,
    CardModule,
    NotificationModule,
    RatingsModule,
    // RealtimeModule,
    // OrdersFacadeModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
