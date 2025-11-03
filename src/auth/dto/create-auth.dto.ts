/* eslint-disable prettier/prettier */
// import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '../entities/user.entity';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateAuthDto {
  @IsNotEmpty()
  @IsString()
  readonly phoneNumber: string;

  @IsNotEmpty()
  @IsEmail()
  readonly email: string;

  @IsNotEmpty()
  @MinLength(6)
  readonly password: string;

  @IsNotEmpty()
  @IsString()
  readonly firstName?: string;

  @IsNotEmpty()
  @IsString()
  readonly lastName?: string;

  @IsOptional()
  @IsEnum(UserRole)
  readonly role?: UserRole;
}
export class LoginAuthDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
  @IsNotEmpty()
  @IsString()
  role: UserRole;

  @IsNotEmpty()
  @MinLength(6)
  password: string;
}

export class CreateAuthDtoDriver {
  @IsNotEmpty()
  @IsString()
  readonly phoneNumber: string;

  @IsNotEmpty()
  @IsEmail()
  readonly email: string;

  @IsNotEmpty()
  @MinLength(6)
  readonly password: string;

  @IsOptional()
  @IsString()
  readonly fname?: string;

  @IsOptional()
  @IsString()
  readonly lname?: string;

  @IsOptional()
  @IsEnum(UserRole)
  readonly role?: UserRole;

  @IsOptional()
  @IsString()
  drive_country?: string;

  @IsOptional()
  @IsString()
  drive_city?: string;
}
