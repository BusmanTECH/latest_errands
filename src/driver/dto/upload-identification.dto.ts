import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UploadIdentificationDto {
  @ApiProperty({
    description: 'NIN (National Identification Number)',
    example: '12345678901',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'NIN must be a string' })
  nin?: string;

  @ApiProperty({
    description: 'Driver License Number',
    example: 'DL1234567890',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'Driver License must be a string' })
  driverLicense?: string;
}

