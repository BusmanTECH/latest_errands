import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class DeliveryTypePricingDto {
  @ApiPropertyOptional() instant?: number;
  @ApiPropertyOptional() schedule?: number;
}

class PerKmPricingDto {
  @ApiPropertyOptional() normal?: number;
  @ApiPropertyOptional() express?: number;
}

class SurchargesDto {
  @ApiPropertyOptional() rainPerKm?: number;
  @ApiPropertyOptional() trafficPerKm?: number;
}

export class OrderSettingResponseDto {
  @ApiProperty() name: string;
  @ApiProperty() costPerKm: number;
  @ApiProperty() minCost: number;
  @ApiProperty() maxCost: number;
  @ApiProperty() distanceRang: number;
  @ApiProperty({ type: DeliveryTypePricingDto })
  deliveryTypePricing: DeliveryTypePricingDto;
  @ApiPropertyOptional({ type: PerKmPricingDto })
  perKmPricing?: PerKmPricingDto;
  @ApiPropertyOptional({ type: SurchargesDto }) surcharges?: SurchargesDto;
  @ApiProperty() orderPercentage: number;
  @ApiProperty() limitAmount: number;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}
