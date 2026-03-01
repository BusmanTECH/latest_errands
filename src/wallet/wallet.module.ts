
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { User } from '../auth/entities/user.entity';
import { WithdrawalRequest } from './entities/withdrawal-request.entity';
import { BankInformation } from './entities/bank-information.entity';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { PaymentModule } from '../payment/payment.module';
import { NotificationModule } from '../notification/notification.module';
import { MailModule } from '../mail/mail.module';
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, User, WithdrawalRequest, BankInformation]),
    forwardRef(() => PaymentModule),
    NotificationModule,
    MailModule,
    TransactionModule,
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}

