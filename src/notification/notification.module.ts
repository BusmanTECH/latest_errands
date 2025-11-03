/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { PushToken } from './entities/push-token.entity';
import { User } from '../auth/entities/user.entity';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, PushToken, User]),
    AuthModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}

