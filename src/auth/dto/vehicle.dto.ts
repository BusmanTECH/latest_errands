import { IsString, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateVehicleDto {
  @ApiProperty({ description: 'Vehicle type', example: 'Sedan' })
  @IsString()
  vehicleType: string;

  @ApiProperty({ description: 'Vehicle brand', example: 'Toyota', required: false })
  @IsOptional()
  @IsString()
  vehicleBrand?: string;

  @ApiProperty({ description: 'Vehicle year', example: '2020', required: false })
  @IsOptional()
  @IsString()
  vehicleYear?: string;

  @ApiProperty({ description: 'Vehicle color', example: 'Black' })
  @IsString()
  vehicleColor: string;

  @ApiProperty({ description: 'License plate number', example: 'ABC-1234' })
  @IsString()
  licensePlate: string;

  @ApiProperty({
    description: 'Vehicle capacity (weight/volume)',
    example: 500,
    type: Number,
  })
  @IsNumber({}, { message: 'Vehicle capacity must be a number' })
  @Min(0, { message: 'Vehicle capacity must be greater than or equal to 0' })
  vehicleCapacity: number;

  @ApiProperty({ description: 'Capacity unit', example: 'Kg' })
  @IsString()
  unit: string;

  @ApiProperty({
    description: 'Special equipment (optional)',
    example: 'Air Conditioning, GPS Navigation',
    required: false,
  })
  @IsOptional()
  @IsString()
  specialEquipment?: string;
}

export class UpdateVehicleDto {
  @ApiProperty({ description: 'Vehicle type', example: 'Sedan', required: false })
  @IsOptional()
  @IsString()
  vehicleType?: string;

  @ApiProperty({ description: 'Vehicle brand', example: 'Toyota', required: false })
  @IsOptional()
  @IsString()
  vehicleBrand?: string;

  @ApiProperty({ description: 'Vehicle year', example: '2020', required: false })
  @IsOptional()
  @IsString()
  vehicleYear?: string;

  @ApiProperty({ description: 'Vehicle color', example: 'Black', required: false })
  @IsOptional()
  @IsString()
  vehicleColor?: string;

  @ApiProperty({ description: 'License plate number', example: 'ABC-1234', required: false })
  @IsOptional()
  @IsString()
  licensePlate?: string;

  @ApiProperty({
    description: 'Vehicle capacity (weight/volume)',
    example: 500,
    type: Number,
    required: false,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Vehicle capacity must be a number' })
  @Min(0, { message: 'Vehicle capacity must be greater than or equal to 0' })
  vehicleCapacity?: number;

  @ApiProperty({ description: 'Capacity unit', example: 'Kg', required: false })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({
    description: 'Special equipment',
    example: 'Air Conditioning, GPS Navigation',
    required: false,
  })
  @IsOptional()
  @IsString()
  specialEquipment?: string;
}
