/* eslint-disable prettier/prettier */
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { User } from '../auth/entities/user.entity';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, User]),
    forwardRef(() => PaymentModule),
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}

