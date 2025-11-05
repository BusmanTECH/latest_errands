
import { IsString, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DeviceType } from '../entities/push-token.entity';

export class RegisterTokenDto {
  @ApiProperty({
    description: 'Expo push notification token',
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  })
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  token: string;

  @ApiProperty({
    description: 'Device type',
    enum: DeviceType,
    example: DeviceType.IOS,
  })
  @IsEnum(DeviceType, { message: 'Device type must be ios or android' })
  @IsNotEmpty({ message: 'Device type is required' })
  deviceType: DeviceType;
}

