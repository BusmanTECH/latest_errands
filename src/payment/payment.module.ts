import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { User } from '../auth/entities/user.entity';
import { Card } from '../auth/entities/card.entity';
import { WalletModule } from '../wallet/wallet.module';
import { ServicesModule } from '../services/services.module';
import { TransactionModule } from '../transaction/transaction.module';
import { PricingModule } from '../pricing/pricing.module';
import { DriverModule } from '../driver/driver.module';
import { CardModule } from '../card/card.module';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentTransaction, User, Card]),
    forwardRef(() => WalletModule),
    ServicesModule,
    TransactionModule,
    PricingModule,
    DriverModule,
    forwardRef(() => CardModule),
    forwardRef(() => OrderModule),
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
