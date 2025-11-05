
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthModule } from 'src/auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { MailModule } from '../mail/mail.module';
import { User } from '../auth/entities/user.entity';
import { Order } from '../order/entities/order.entity';
import { Transaction } from '../transaction/entities/transaction.entity';

@Module({
  imports: [
    AuthModule,
    NotificationModule,
    MailModule,
    TypeOrmModule.forFeature([User, Order, Transaction]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
