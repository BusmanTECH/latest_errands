import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpStatus,
  HttpException,
  Query,
  BadRequestException,
  HttpCode,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  ParseUUIDPipe,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import {
  CreateAuthDto,
  CreateAuthDtoDriver,
  LoginAuthDto,
} from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { User } from './entities/user.entity';
import { CreateVehicleDto } from './dto/vehicle.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import * as path from 'path';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthGuard } from '@nestjs/passport';
import { Users } from 'src/decorators/user.decorator';
import { SignupUserDto } from './dto/signup-user.dto';
import { SignupDriverDto } from './dto/signup-driver.dto';
import { UserRole } from './entities/user.entity';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { DeleteAccountDto } from './dto/delete-account.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  
  @Post('signup/user')
  async signupUser(@Res() res, @Body() dto: SignupUserDto): Promise<any> {
    console.log('createUserDto', dto);
    try {
      const user = await this.authService.createUser({
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        password: dto.password,
        firstName: dto.firstName,
        lastName: dto.lastName,
      });

      return res.status(HttpStatus.CREATED).json({
        status: HttpStatus.CREATED,
        message: 'User signup successful',
        data: user,
      });
    } catch (error) {
      console.log('error', error);
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'User signup failed',
      });
    }
  }

  @Post('signup/driver')
  async signupDriver(@Res() res, @Body() dto: SignupDriverDto): Promise<any> {
    try {
      const driver = await this.authService.createDriver({
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        password: dto.password,
        firstName: dto.firstName,
        lastName: dto.lastName,
        gender: dto.gender,
        birthDate: dto.birthDate,
        driveCountry: dto.driveCountry,
        driveCity: dto.driveCity,
      });

      return res.status(HttpStatus.CREATED).json({
        status: HttpStatus.CREATED,
        message: 'Driver signup successful',
        data: driver,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Driver signup failed',
      });
    }
  }

  
  @Get('verify/email')
  async verifyEmailOtp(@Res() res, @Query('otp') otp: string) {
    const { accessToken, user } = await this.authService.verifyEmailOtp(otp);
    return res.status(HttpStatus.OK).json({
      status: HttpStatus.OK,
      message: 'Email verified',
      data: {
        accessToken,

        user,
      },
    });
  }

  @Post('resend-otp')
  async resendEmailOtp(@Res() res, @Body() body: { email: string }) {
    await this.authService.resendEmailOtp(body.email);
    return res.status(HttpStatus.OK).json({
      status: HttpStatus.OK,
      message: 'Verification code sent successfully',
    });
  }

  
  @Post('forgot-password')
  async forgotPassword(@Res() res, @Body() body: { email: string }) {
    await this.authService.forgotPassword(body.email);
    return res.status(HttpStatus.OK).json({
      status: HttpStatus.OK,
      message: 'Reset code sent successfully',
    });
  }

  @Post('reset-password')
  async resetPassword(
    @Res() res,
    @Body()
    body: {
      email: string;
      otp: string;
      newPassword: string;
    },
  ) {
    await this.authService.resetPassword(
      body.email,
      body.otp,
      body.newPassword,
    );
    return res
      .status(HttpStatus.OK)
      .json({ status: HttpStatus.OK, message: 'Password reset successful' });
  }

  @Post('resend-forgot-password')
  async resendForgotPassword(@Res() res, @Body() body: { email: string }) {
    await this.authService.resendForgotPasswordOtp(body.email);
    return res.status(HttpStatus.OK).json({
      status: HttpStatus.OK,
      message: 'Reset code resent successfully',
    });
  }

  @Post('login')
  async login(
    @Body() loginAuthDto: LoginAuthDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<any> {
    try {
      const { accessToken, refreshToken, user } =
        await this.authService.login(loginAuthDto);

      if (user?.role != loginAuthDto?.role) {
        throw new UnauthorizedException('Invalid role for this account');
      }
      const safeUser = {
        id: user?.id,
        email: user?.email,
        phoneNumber: user?.phoneNumber,
        firstName: user?.firstName,
        lastName: user?.lastName,
        gender: user?.gender,
        birthDate: user?.birthDate,
        role: user?.role,
        isEmailVerified: user?.isEmailVerified,
        averageRating: user?.averageRating,
        isOnline: user?.isOnline,
        isApproved: user?.isApproved,
        totalEarnings: user?.totalEarnings,
        deliveriesCount: user?.deliveriesCount,
      };

      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message: 'Login successful',
        data: {
          accessToken,

          user: safeUser,
        },
      });
    } catch (error) {
      
      const errorMessage =
        error?.message || error?.response?.message || 'Authentication failed';

      
      const isUnverifiedError =
        errorMessage &&
        (errorMessage.includes('not verified') ||
          errorMessage.includes('Email not verified'));
      const statusCode = isUnverifiedError ? 428 : HttpStatus.UNAUTHORIZED;

      return res.status(statusCode).json({
        status: statusCode,
        message: errorMessage,
      });
    }
  }

  @Post('logout')
  async logout(@Res() res: Response): Promise<any> {
    res.cookie('refreshToken', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 0,
    });

    return res.status(HttpStatus.OK).json({
      status: HttpStatus.OK,
      message: 'Logout successful',
    });
  }

  

  @Get('health')
  healthCheck(): string {
    return 'OK';
  }

  @Patch('password')
  @UseGuards(AuthGuard('jwt'))
  async changePassword(
    @Users('sub') userId: string,
    @Body() dto: ChangePasswordDto,
    @Res() res,
  ) {
    return this.authService.changePassword(
      userId,
      dto.oldPassword,
      dto.newPassword,
    );
    return res.status(HttpStatus.OK).json({
      status: HttpStatus.OK,
      message: 'Password changed successfully',
    });
  }

  private static imageUploadOptions = {
    limits: { fileSize: 5 * 1024 * 1024 }, 
    fileFilter: (req, file, callback) => {
      const allowed = ['image/jpeg', 'image/png', 'image/gif'];
      if (!allowed.includes(file.mimetype)) {
        return callback(
          new BadRequestException('Invalid image MIME type'),
          false,
        );
      }
      callback(null, true);
    },
  };

  
  @Post('profile_img')
  async deprecatedProfileImg(@Res() res, @Body() body: { image: string }) {
    return res.status(HttpStatus.OK).json({
      status: HttpStatus.OK,
      message: 'Moved to POST /profile/profile_img',
      deprecated: true,
    });
  }

  @Post('plate_num_img')
  async deprecatedPlateImg(@Res() res, @Body() body: { image: string }) {
    return res.status(HttpStatus.OK).json({
      status: HttpStatus.OK,
      message: 'Moved to POST /profile/plate_num_img',
      deprecated: true,
    });
  }

  @Post('vehicle_img')
  async deprecatedVehicleImg(@Res() res, @Body() body: { image: string }) {
    return res.status(HttpStatus.OK).json({
      status: HttpStatus.OK,
      message: 'Moved to POST /profile/vehicle_img',
      deprecated: true,
    });
  }

  @Post('license_img')
  async deprecatedLicenseImg(@Res() res, @Body() body: { image: string }) {
    return res.status(HttpStatus.OK).json({
      status: HttpStatus.OK,
      message: 'Moved to POST /profile/license_img',
      deprecated: true,
    });
  }

  @Delete('account')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async deleteAccount(
    @Users() user: any,
    @Body() deleteAccountDto: DeleteAccountDto,
    @Res() res: Response,
  ) {
    try {
      const userId = user.id || user.sub || user._id;
      const result = await this.authService.deleteAccount(
        userId,
        deleteAccountDto.reason,
        deleteAccountDto.additionalNotes,
      );
      return res.status(HttpStatus.OK).json(result);
    } catch (error) {
      const httpStatus = error.status || HttpStatus.INTERNAL_SERVER_ERROR;
      return res.status(httpStatus).json({
        success: false,
        message: error.message || 'Failed to delete account',
      });
    }
  }
}
