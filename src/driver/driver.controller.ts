
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Res,
  UseGuards,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import {
  FileInterceptor,
  FilesInterceptor,
  AnyFilesInterceptor,
} from '@nestjs/platform-express';
import { DriverService } from './driver.service';
import { AuthGuard } from '@nestjs/passport';
import { Users } from 'src/decorators/user.decorator';
import { Request, Response } from 'express';
import { GenderType } from 'src/auth/entities/user.entity';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { UploadIdentificationDto } from './dto/upload-identification.dto';
import { CreateVehicleDto } from '../auth/dto/vehicle.dto';

@Controller('driver')
@UseGuards(AuthGuard('jwt'))
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Get('/profile')
  async getDriver(@Users('sub') userId: string, @Res() res: Response) {
    try {
      const driver = await this.driverService.getDriverProfile(userId);
      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message: 'Driver profile fetched successfully',
        data: driver,
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to fetch driver profile',
      });
    }
  }

  @Patch('/profile')
  async updateDriver(
    @Users('sub') userId: string,
    @Body()
    body: Partial<{
      firstName: string;
      lastName: string;
      phoneNumber: string;
      gender: GenderType;
      birthDate: string;
      driveCountry: string;
      driveCity: string;
    }>,
    @Res() res: Response,
  ) {
    try {
      const updated = await this.driverService.updateDriverProfile(
        userId,
        body,
      );
      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message: 'Driver profile updated successfully',
        data: updated,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to update driver profile',
      });
    }
  }

  @Patch('/password')
  async changePassword(
    @Users('sub') userId: string,
    @Body() dto: ChangePasswordDto,
    @Res() res: Response,
  ) {
    try {
      await this.driverService.changePassword(
        userId,
        dto.oldPassword,
        dto.newPassword,
      );
      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message: 'Password changed successfully',
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to change password',
      });
    }
  }

  @Post('/profile-picture')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 }, 
      fileFilter: (req, file, callback) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/jpg'];
        if (!allowed.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              'Invalid image type. Only JPEG, PNG, and GIF are allowed',
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async uploadProfilePicture(
    @Users('sub') userId: string,
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ) {
    try {
      const result = await this.driverService.uploadProfilePicture(
        userId,
        file,
      );
      return res.status(HttpStatus.CREATED).json({
        status: HttpStatus.CREATED,
        message: result.message,
        data: { fileUrl: result.fileUrl },
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to upload profile picture',
      });
    }
  }
  @Post('/identification')
  async uploadIdentification(
    @Users('sub') userId: string,
    @Body() dto: UploadIdentificationDto,
    @Res() res: Response,
  ) {
    try {
      if (!dto.nin && !dto.driverLicense) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          status: HttpStatus.BAD_REQUEST,
          message: 'Either NIN or driverLicense must be provided',
        });
      }

      const result = await this.driverService.uploadIdentification(
        userId,
        dto.nin,
        dto.driverLicense,
      );
      return res.status(HttpStatus.CREATED).json({
        status: HttpStatus.CREATED,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to upload identification',
      });
    }
  }

  @Post('/vehicle')
  async uploadVehicle(
    @Users('sub') userId: string,
    @Body() dto: CreateVehicleDto,
    @Res() res: Response,
  ) {
    try {
      const result = await this.driverService.uploadVehicle(userId, dto);
      return res.status(HttpStatus.CREATED).json({
        status: HttpStatus.CREATED,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to upload vehicle information',
      });
    }
  }

  @Post('/documents')
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: 5 * 1024 * 1024 }, 
      fileFilter: (req, file, callback) => {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/jpg'];
        if (!allowed.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              'Invalid image type. Only JPEG, PNG, and GIF are allowed',
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async uploadDocuments(
    @Users('sub') userId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Res() res: Response,
  ) {
    try {
      if (!files || files.length === 0) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          status: HttpStatus.BAD_REQUEST,
          message: 'At least one file must be uploaded',
        });
      }

      
      const transformedFiles: {
        selfie?: Express.Multer.File[];
        driverLicense?: Express.Multer.File[];
        vehicleLicensePlate?: Express.Multer.File[];
        vehicleRegistration?: Express.Multer.File[];
      } = {};

      files.forEach((file: Express.Multer.File) => {
        const fieldName = file.fieldname?.toLowerCase() || '';

        if (
          fieldName === 'selfie' ||
          fieldName === 'profile' ||
          fieldName === 'profileimage' ||
          fieldName === 'profile_image' ||
          fieldName === 'photo'
        ) {
          if (!transformedFiles.selfie) transformedFiles.selfie = [];
          transformedFiles.selfie.push(file);
          console.log('Added file to selfie array');
        } else if (
          fieldName === 'driverlicense' ||
          fieldName === 'driver_license' ||
          fieldName === 'license'
        ) {
          if (!transformedFiles.driverLicense)
            transformedFiles.driverLicense = [];
          transformedFiles.driverLicense.push(file);
        } else if (
          fieldName === 'vehiclelicenseplate' ||
          fieldName === 'vehicle_license_plate' ||
          fieldName === 'plate'
        ) {
          if (!transformedFiles.vehicleLicensePlate)
            transformedFiles.vehicleLicensePlate = [];
          transformedFiles.vehicleLicensePlate.push(file);
        } else if (
          fieldName === 'vehicleregistration' ||
          fieldName === 'vehicle_registration' ||
          fieldName === 'registration'
        ) {
          if (!transformedFiles.vehicleRegistration)
            transformedFiles.vehicleRegistration = [];
          transformedFiles.vehicleRegistration.push(file);
        }
      });

      
      console.log('Transformed files before upload:', {
        hasSelfie: !!transformedFiles.selfie,
        selfieCount: transformedFiles.selfie?.length || 0,
        hasDriverLicense: !!transformedFiles.driverLicense,
        hasVehicleLicensePlate: !!transformedFiles.vehicleLicensePlate,
        hasVehicleRegistration: !!transformedFiles.vehicleRegistration,
      });

      const result = await this.driverService.uploadDocuments(
        userId,
        transformedFiles,
      );

      console.log('Upload documents result:', result);

      return res.status(HttpStatus.CREATED).json({
        status: HttpStatus.CREATED,
        message: result.message,
        data: result.data,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to upload documents',
      });
    }
  }

  @Patch('/online-status')
  async toggleOnlineStatus(@Users('sub') userId: string, @Res() res: Response) {
    try {
      const result = await this.driverService.toggleOnlineStatus(userId);
      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message: result.message,
        data: {
          isOnline: result.isOnline,
          isApproved: result.isApproved,
        },
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to toggle driver online status',
      });
    }
  }
}
