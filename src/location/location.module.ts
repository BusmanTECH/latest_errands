/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { LocationGateway } from './location.gateway';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [LocationGateway]
})
export class LocationModule {}
