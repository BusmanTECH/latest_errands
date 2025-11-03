/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GeneralController } from './general.controller';
import { GeneralService } from './general.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [AuthModule, ConfigModule],
  controllers: [GeneralController],
  providers: [GeneralService],
})
export class GeneralModule {}


