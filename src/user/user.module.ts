/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../auth/entities/user.entity';
import { ProfileImage } from '../auth/entities/profile.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, ProfileImage])],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}


