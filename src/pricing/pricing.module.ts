import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { PricingSettings } from './entities/pricing-settings.entity';
// import { TrafficWeatherService } from '../order/trafficWeather.service';

@Module({
  imports: [TypeOrmModule.forFeature([PricingSettings])],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
