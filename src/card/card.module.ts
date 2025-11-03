import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Card } from '../auth/entities/card.entity';
import { User } from '../auth/entities/user.entity';
import { CardController } from './card.controller';
import { CardService } from './card.service';
import { ServicesModule } from '../services/services.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentModule } from '../payment/payment.module';
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Card, User]),
    ServicesModule,
    AuthModule,
    forwardRef(() => PaymentModule),
    TransactionModule,
  ],
  controllers: [CardController],
  providers: [CardService],
  exports: [CardService],
})
export class CardModule {}

