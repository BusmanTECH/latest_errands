import { IsString, IsNumber, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateOrderSettingsDto {
  @ApiPropertyOptional() @IsString() @IsOptional() name?: string;
  @ApiPropertyOptional() @IsNumber() @IsOptional() costPerKm?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() minCost?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() maxCost?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() distanceRang?: number;
  @ApiPropertyOptional() @IsObject() @IsOptional() deliveryTypePricing?: {
    instant?: number;
    schedule?: number;
  };
  @ApiPropertyOptional() @IsNumber() @IsOptional() orderPercentage?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() limitAmount?: number;
  @ApiPropertyOptional() @IsObject() @IsOptional() perKmPricing?: {
    normal?: number;
    express?: number;
  };
  @ApiPropertyOptional() @IsObject() @IsOptional() surcharges?: {
    rainPerKm?: number;
    trafficPerKm?: number;
  };
}

export class CreateOrderSettingsDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsNumber() costPerKm: number;
  @ApiProperty() @IsNumber() minCost: number;
  @ApiProperty() @IsNumber() maxCost: number;
  @ApiProperty() @IsNumber() distanceRang: number;
  @ApiPropertyOptional() @IsObject() @IsOptional() deliveryTypePricing?: {
    instant?: number;
    schedule?: number;
  };
  @ApiPropertyOptional() @IsNumber() @IsOptional() orderPercentage?: number;
  @ApiPropertyOptional() @IsNumber() @IsOptional() limitAmount?: number;
  @ApiPropertyOptional() @IsObject() @IsOptional() perKmPricing?: {
    normal?: number;
    express?: number;
  };
  @ApiPropertyOptional() @IsObject() @IsOptional() surcharges?: {
    rainPerKm?: number;
    trafficPerKm?: number;
  };
}
