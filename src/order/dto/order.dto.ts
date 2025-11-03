import { IsString, IsNumber, IsOptional, IsObject, IsArray, IsNotEmpty, IsBoolean, ValidateNested, ArrayMinSize, IsEmail, IsUUID } from "class-validator";
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// Location interface: only address and coordinate
class LocationCoordinateDto {
  @IsNumber()
  lat: number;

  @IsNumber()
  lng: number;
}

class LocationDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsObject()
  @ValidateNested()
  @Type(() => LocationCoordinateDto)
  coordinate: LocationCoordinateDto;
}

// Contact details interface: name, phoneNumber (required), email (optional)
class ContactDetailsDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsEmail()
  @IsOptional()
  email?: string;
}

export class orderDto {
    @IsString() @IsNotEmpty() scope: string;
    @IsString() @IsNotEmpty() vehicle: string;
    @IsString() @IsNotEmpty() packageType: string;
    @IsObject() @ValidateNested() @Type(() => LocationDto) pickupLocation: LocationDto;
    @IsObject() @ValidateNested() @Type(() => LocationDto) deliveryLocation: LocationDto;
    @IsString() @IsOptional() closeLandmark?: string;
    @IsString() @IsNotEmpty() deliveryType: string;
    @IsString() @IsNotEmpty() shippingType: string;
    @IsString() @IsOptional() scheduledPickupTime?: string;
    @IsObject() @ValidateNested() @Type(() => ContactDetailsDto) receiverDetails: ContactDetailsDto;
    @IsObject() @ValidateNested() @Type(() => ContactDetailsDto) pickupDetails: ContactDetailsDto;
    @IsString() instruction: string;
    @IsString() @IsOptional() description?: string;
    @IsString() @IsNotEmpty() packageSize: string;
    @IsArray() @IsOptional() images?: string[];
    @IsBoolean() @IsOptional() saveLocation?: boolean;
    @IsString() @IsOptional() parishableHandling?: string;
}

export class DeliveryItem {
    @IsObject() @ValidateNested() @Type(() => LocationDto) deliveryLocation: LocationDto;
    @IsObject() @ValidateNested() @Type(() => ContactDetailsDto) receiverDetails: ContactDetailsDto;
}

export class multipleOrderDto {
    @IsString() @IsNotEmpty() scope: string;
    @IsString() @IsNotEmpty() vehicle: string;
    @IsString() @IsNotEmpty() packageType: string;
    @IsObject() @ValidateNested() @Type(() => LocationDto) pickupLocation: LocationDto;
    @IsArray() @ValidateNested({ each: true }) @Type(() => DeliveryItem) @ArrayMinSize(1) deliveries: DeliveryItem[];
    @IsString() @IsOptional() closeLandmark?: string;
    @IsString() @IsNotEmpty() deliveryType: string;
    @IsString() @IsNotEmpty() shippingType: string;
    @IsString() @IsOptional() scheduledPickupTime?: string;
    @IsObject() @ValidateNested() @Type(() => ContactDetailsDto) pickupDetails: ContactDetailsDto;
    @IsString() instruction: string;
    @IsString() @IsOptional() description?: string;
    @IsString() @IsNotEmpty() packageSize: string;
    @IsArray() @IsOptional() images?: string[];
    @IsBoolean() @IsOptional() saveLocation?: boolean;
    @IsString() @IsOptional() parishableHandling?: string;
}

export class AssignOrderDto {
  @ApiProperty({
    description: 'Order ID to assign',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID('4', { message: 'Order ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Order ID is required' })
  orderId: string;

  @ApiProperty({
    description: 'Rider ID to assign the order to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID('4', { message: 'Rider ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Rider ID is required' })
  riderId: string;
}
