import { ApiProperty } from '@nestjs/swagger';

export class CostDataDto {
  @ApiProperty()
  distance: number;

  @ApiProperty()
  eta: number;

  @ApiProperty()
  cost: number;

  @ApiProperty()
  baseCost: number;

  @ApiProperty({ required: false })
  perKm?: number;

  @ApiProperty()
  deliveryTypeCost: number;

  @ApiProperty({ required: false })
  weatherTrafficSurcharge?: number;

  @ApiProperty({ required: false })
  perishableSurcharge?: number;

  @ApiProperty()
  deliveryType: string;
}

export class CostResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiProperty({ type: CostDataDto })
  data: CostDataDto;
}

export class MultipleCostItemDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  deliveryCoords: any;

  @ApiProperty({ required: false })
  distance?: number;

  @ApiProperty({ required: false })
  eta?: number;

  @ApiProperty({ required: false })
  cost?: number;

  @ApiProperty({ required: false })
  baseCost?: number;

  @ApiProperty({ required: false })
  deliveryTypeCost?: number;

  @ApiProperty({ required: false })
  perishableSurcharge?: number;

  @ApiProperty({ required: false })
  deliveryType?: string;

  @ApiProperty({ required: false })
  error?: string;
}

export class MultipleCostSummaryDto {
  @ApiProperty()
  totalCost: number;

  @ApiProperty()
  totalDistance: number;

  @ApiProperty()
  totalEta: number;

  @ApiProperty()
  totalDeliveryTypeCost: number;

  @ApiProperty({ required: false })
  totalPerishableSurcharge?: number;

  @ApiProperty()
  numberOfDeliveries: number;

  @ApiProperty()
  deliveryType: string;
}

export class MultipleCostResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiProperty({ type: [MultipleCostItemDto] })
  data: any;
}
