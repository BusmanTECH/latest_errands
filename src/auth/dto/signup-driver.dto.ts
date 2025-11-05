
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export enum GenderType {
  MALE = 'male',
  FEMALE = 'female',
}

export class SignupDriverDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsNotEmpty()
  @IsString()
  firstName?: string;

  @IsNotEmpty()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEnum(GenderType)
  gender?: GenderType;

  @IsOptional()
  @IsString()
  birthDate: string;
  @IsOptional()
  @IsString()
  driveCountry?: string;

  @IsOptional()
  @IsString()
  driveCity?: string;
}
