
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SignupUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  password: string;


  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;
}
