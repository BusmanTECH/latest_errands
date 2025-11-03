/* eslint-disable prettier/prettier */
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GenderType, User, UserRole } from '../auth/entities/user.entity';
import * as bcrypt from 'bcrypt';
import { ProfileImage } from '../auth/entities/profile.entity';
import { Nin, RiderType } from '../auth/entities/nin';
import { DiverLicense } from '../auth/entities/license.entity';
import { Vehicle } from '../auth/entities/vehicle.entity';
import { CreateVehicleDto } from '../auth/dto/vehicle.dto';
import { VehicleReg } from '../auth/entities/VehicleReg.entity';
import { plateNum } from '../auth/entities/plateNum.entity';
import { LicenseImg } from '../auth/entities/licenseImg.entity';
import * as AWS from 'aws-sdk';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class DriverService {
  private s3: AWS.S3 | null;
  private bucketName: string | null;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(ProfileImage)
    private readonly profileImageRepo: Repository<ProfileImage>,
    @InjectRepository(Nin)
    private readonly ninRepository: Repository<Nin>,
    @InjectRepository(DiverLicense)
    private readonly licenseRepository: Repository<DiverLicense>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepository: Repository<Vehicle>,
    @InjectRepository(VehicleReg)
    private readonly vehicleRegRepository: Repository<VehicleReg>,
    @InjectRepository(plateNum)
    private readonly plateNumRepository: Repository<plateNum>,
    @InjectRepository(LicenseImg)
    private readonly licenseImgRepository: Repository<LicenseImg>,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    const accessKeyId = this.configService.get<string>('LINODE_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'LINODE_SECRET_ACCESS_KEY',
    );
    const endpoint = this.configService.get<string>('LINODE_ENDPOINT');
    const region = this.configService.get<string>('LINODE_REGION');
    const bucketName = this.configService.get<string>('LINODE_BUCKET_NAME');

    // Initialize S3 only if all credentials are provided
    if (accessKeyId && secretAccessKey && endpoint && region && bucketName) {
      this.s3 = new AWS.S3({
        endpoint: endpoint,
        region: region,
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        signatureVersion: 'v4',
        s3ForcePathStyle: true, // Required for Linode Object Storage
        credentials: new AWS.Credentials(accessKeyId, secretAccessKey), // Explicitly set credentials to prevent metadata service lookup
      });
      this.bucketName = bucketName;
    } else {
      // Log warning but don't throw - allows app to start without file upload functionality
      const missing = [
        !accessKeyId && 'LINODE_ACCESS_KEY_ID',
        !secretAccessKey && 'LINODE_SECRET_ACCESS_KEY',
        !endpoint && 'LINODE_ENDPOINT',
        !region && 'LINODE_REGION',
        !bucketName && 'LINODE_BUCKET_NAME',
      ].filter(Boolean);
      console.warn(
        `⚠️  Linode Object Storage not configured. Missing: ${missing.join(', ')}. File upload features will be disabled.`,
      );
      this.s3 = null;
      this.bucketName = null;
    }
  }

  async getDriverProfile(id: string) {
    const user = await this.userRepo.findOne({
      where: { id, role: UserRole.RIDER },
      relations: [
        'driverLicense',
        'nin',
        'vehicle',
        'vehicleRegImage',
        'profileImage',
        'plateNumberImage',
        'licenseImage',
      ],
    });
    if (!user) throw new NotFoundException('Driver not found');

    // Use the stored averageRating from user entity
    const averageRating = Number(user.averageRating) || 0;

    // Calculate average earnings
    const totalEarnings = Number(user.totalEarnings) || 0;
    const deliveriesCount = user.deliveriesCount || 0;
    const avgEarnings =
      deliveriesCount > 0 ? totalEarnings / deliveriesCount : 0;

    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      gender: user.gender,
      birthDate: user.birthDate,
      role: user.role,
      profileImage: user.profileImage,
      isEmailVerified: user.isEmailVerified,
      isOnline: user.isOnline || false,
      isApproved: user.isApproved || false,
      averageRating: Math.round(averageRating * 10) / 10,
      documents: {
        nin: user.nin,
        driverLicense: user.driverLicense,

        vehicleRegImage: user.vehicleRegImage,
        plateNumberImage: user.plateNumberImage,
        licenseImage: user.licenseImage,
      },
      vehicle: user.vehicle,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      deliveriesCount: deliveriesCount,
      avgEarnings: Math.round(avgEarnings * 100) / 100,
    };
  }

  async updateDriverProfile(
    id: string,
    dto: Partial<{
      firstName: string;
      lastName: string;
      phoneNumber: string;
      gender: GenderType;
      birthDate: string;
      driveCountry: string;
      driveCity: string;
    }>,
  ) {
    const user = await this.userRepo.findOne({
      where: { id, role: UserRole.RIDER },
    });
    if (!user) throw new NotFoundException('Driver not found');

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;

    // Check for duplicate phone number before updating
    if (dto.phoneNumber !== undefined && dto.phoneNumber !== user.phoneNumber) {
      const existingUser = await this.userRepo.findOne({
        where: { phoneNumber: dto.phoneNumber },
      });
      if (existingUser && existingUser.id !== user.id) {
        throw new ConflictException(
          'Phone number already exists. Please use a different phone number.',
        );
      }
      user.phoneNumber = dto.phoneNumber;
    }
    if (dto.gender !== undefined) user.gender = dto.gender;
    if (dto.birthDate !== undefined) user.birthDate = dto.birthDate;

    return this.userRepo.save(user);
  }

  async changePassword(
    id: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<string> {
    const user = await this.userRepo.findOne({
      where: { id, role: UserRole.RIDER },
    });
    if (!user) throw new NotFoundException('Driver not found');

    // Verify the old password
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Incorrect old password');
    }

    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await this.userRepo.save(user);

    return 'Password changed successfully';
  }

  private async uploadFileToLinode(file: Express.Multer.File): Promise<string> {
    if (!this.s3 || !this.bucketName) {
      throw new BadRequestException(
        'Linode Object Storage is not configured. Please set LINODE_ENDPOINT, LINODE_REGION, LINODE_ACCESS_KEY_ID, LINODE_SECRET_ACCESS_KEY, and LINODE_BUCKET_NAME environment variables.',
      );
    }

    const params = {
      Bucket: this.bucketName,
      Key: `${Date.now()}-${file.originalname}`,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read',
    };

    try {
      const uploadResult = await this.s3.upload(params).promise();
      return uploadResult.Location;
    } catch (error) {
      throw new BadRequestException(
        'Error uploading file to Linode Object Storage',
        error,
      );
    }
  }

  async uploadProfilePicture(
    driverId: string,
    file: Express.Multer.File,
  ): Promise<{ fileUrl: string; message: string }> {
    if (!file) throw new BadRequestException('Image file is required');

    const user = await this.userRepo.findOne({
      where: { id: driverId, role: UserRole.RIDER },
      relations: ['profileImage'],
    });
    if (!user) throw new NotFoundException('Driver not found');

    const fileUrl = await this.uploadFileToLinode(file);

    const existing = await this.profileImageRepo.findOne({
      where: { user: { id: user.id } },
      relations: ['user'],
    });

    let profileImage;
    if (existing) {
      existing.name = file.originalname;
      existing.url = fileUrl;
      existing.ext = path.extname(file.originalname).slice(1);
      profileImage = await this.profileImageRepo.save(existing);
    } else {
      profileImage = this.profileImageRepo.create({
        name: file.originalname,
        url: fileUrl,
        ext: path.extname(file.originalname).slice(1),
        user: user,
      });
      await this.profileImageRepo.save(profileImage);
    }

    user.profileImage = profileImage;
    await this.userRepo.save(user);

    return { message: 'Profile image uploaded successfully', fileUrl };
  }

  async uploadIdentification(
    driverId: string,
    nin?: string,
    driverLicense?: string,
  ): Promise<{ message: string; data: any }> {
    if (!nin && !driverLicense) {
      throw new BadRequestException(
        'Either NIN or driverLicense must be provided',
      );
    }

    const user = await this.userRepo.findOne({
      where: { id: driverId, role: UserRole.RIDER },
      relations: ['nin', 'driverLicense'],
    });
    if (!user) throw new NotFoundException('Driver not found');

    if (nin) {
      // Fetch NIN details from API
      const ninData = await this.getNinDetails(nin);

      // Create or update NIN entity
      let ninEntity = user.nin;
      if (!ninEntity) {
        ninEntity = this.ninRepository.create({
          birthDate: ninData.birthDate,
          gender: ninData.gender,
          riderType: RiderType.RIDER,
          employmentStatus: ninData.employmentStatus,
          trackingId: ninData.trackingId,
          residenceAdressLine1: ninData.residenceAdressLine1,
          telephoneNo: ninData.telephoneNo,
          user: user,
        });
      } else {
        Object.assign(ninEntity, {
          birthDate: ninData.birthDate,
          gender: ninData.gender,
          employmentStatus: ninData.employmentStatus,
          trackingId: ninData.trackingId,
          residenceAdressLine1: ninData.residenceAdressLine1,
          telephoneNo: ninData.telephoneNo,
        });
      }

      user.nin = await this.ninRepository.save(ninEntity);
      await this.userRepo.save(user);

      return {
        message: 'NIN identification processed successfully',
        data: {
          trackingId: ninData.trackingId,
          birthDate: ninData.birthDate,
        },
      };
    }

    if (driverLicense) {
      // Fetch driver license details from API
      const licenseData = await this.getDriverLicenseDetails(driverLicense);

      // Create or update DiverLicense entity
      let licenseEntity = user.driverLicense;
      if (!licenseEntity) {
        licenseEntity = this.licenseRepository.create({
          licenseNo: driverLicense,
          birthdate: licenseData.birthdate,
          gender: licenseData.gender,
          issuedDate: licenseData.issuedDate,
          expiryDate: licenseData.expiryDate,
          stateOfIssue: licenseData.stateOfIssue,
          user: user,
        });
      } else {
        Object.assign(licenseEntity, {
          licenseNo: driverLicense,
          birthdate: licenseData.birthdate,
          gender: licenseData.gender,
          issuedDate: licenseData.issuedDate,
          expiryDate: licenseData.expiryDate,
          stateOfIssue: licenseData.stateOfIssue,
        });
      }

      user.driverLicense = await this.licenseRepository.save(licenseEntity);
      await this.userRepo.save(user);

      return {
        message: 'Driver license identification processed successfully',
        data: {
          licenseNo: driverLicense,
          expiryDate: licenseData.expiryDate,
        },
      };
    }

    throw new BadRequestException(
      'Either NIN or driverLicense must be provided',
    );
  }

  private async getNinDetails(nin: string) {
    try {
      const response = await this.httpService.axiosRef.get(
        `https://api.dikript.com/dikript/test/api/v1/getnin?nin=${nin}`,
        { headers: { 'x-api-key': process.env.NIN_VER } },
      );
      if (response.data?.status === true && response.data?.data) {
        return response.data.data;
      } else {
        throw new BadRequestException(
          response.data?.error?.message || 'Failed to fetch NIN details',
        );
      }
    } catch (error) {
      const msg =
        (error && (error.message || error.response?.data?.message)) ||
        'Error retrieving NIN details. Please try again later.';
      throw new BadRequestException(msg);
    }
  }

  private async getDriverLicenseDetails(licenseNo: string) {
    try {
      const response = await this.httpService.axiosRef.get(
        `https://api.dikript.com/dikript/test/api/v1/getfrsc?frsc=${licenseNo}`,
        { headers: { 'x-api-key': process.env.BVN_VER } },
      );
      if (response.data?.status === true && response.data?.data) {
        return response.data.data;
      } else {
        throw new BadRequestException(
          response.data?.error?.message ||
            'Failed to fetch Driver License details',
        );
      }
    } catch (error) {
      const msg =
        (error && (error.message || error.response?.data?.message)) ||
        'Error retrieving Driver License details. Please try again later.';
      throw new BadRequestException(msg);
    }
  }

  async uploadVehicle(
    driverId: string,
    dto: CreateVehicleDto,
  ): Promise<{ message: string; data: Vehicle }> {
    const user = await this.userRepo.findOne({
      where: { id: driverId, role: UserRole.RIDER },
      relations: ['vehicle'],
    });
    if (!user) throw new NotFoundException('Driver not found');

    // Check if license plate already exists for another user
    const existingVehicle = await this.vehicleRepository.findOne({
      where: { licensePlate: dto.licensePlate },
      relations: ['user'],
    });

    if (existingVehicle && existingVehicle.user?.id !== user.id) {
      throw new ConflictException(
        'This license plate number is already in use',
      );
    }

    let vehicle = user.vehicle;

    if (vehicle) {
      // Update existing vehicle
      Object.assign(vehicle, dto);
      vehicle = await this.vehicleRepository.save(vehicle);
    } else {
      // Create new vehicle
      vehicle = this.vehicleRepository.create({
        ...dto,
        user: user,
      });
      vehicle = await this.vehicleRepository.save(vehicle);
      user.vehicle = vehicle;
      await this.userRepo.save(user);
    }

    return {
      message: 'Vehicle information uploaded successfully',
      data: vehicle,
    };
  }

  async uploadDocuments(
    driverId: string,
    files: {
      selfie?: Express.Multer.File[];
      driverLicense?: Express.Multer.File[];
      vehicleLicensePlate?: Express.Multer.File[];
      vehicleRegistration?: Express.Multer.File[];
    },
  ): Promise<{
    message: string;
    data: {
      selfie?: string;
      driverLicense?: string;
      vehicleLicensePlate?: string;
      vehicleRegistration?: string;
    };
  }> {
    const user = await this.userRepo.findOne({
      where: { id: driverId, role: UserRole.RIDER },
      relations: [
        'profileImage',
        'licenseImage',
        'plateNumberImage',
        'vehicleRegImage',
      ],
    });
    if (!user) throw new NotFoundException('Driver not found');

    const uploadedFiles: {
      selfie?: string;
      driverLicense?: string;
      vehicleLicensePlate?: string;
      vehicleRegistration?: string;
    } = {};

    // Upload Selfie (Profile Image)
    if (files.selfie && files.selfie.length > 0) {
      try {
        const file = files.selfie[0];

        console.log('Processing selfie upload:', {
          fileName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          hasBuffer: !!file.buffer,
        });

        if (!file || !file.buffer) {
          throw new BadRequestException('Selfie file is empty or invalid');
        }
        const fileUrl = await this.uploadFileToLinode(file);
        console.log('Selfie uploaded successfully, URL:', fileUrl);
        const existing = await this.profileImageRepo.findOne({
          where: { user: { id: user.id } },
          relations: ['user'],
        });

        let profileImage;
        if (existing) {
          existing.name = file.originalname;
          existing.url = fileUrl;
          existing.ext = path.extname(file.originalname).slice(1);
          profileImage = await this.profileImageRepo.save(existing);
        } else {
          profileImage = this.profileImageRepo.create({
            name: file.originalname,
            url: fileUrl,
            ext: path.extname(file.originalname).slice(1),
            user: user,
          });
          await this.profileImageRepo.save(profileImage);
        }
        user.profileImage = profileImage;
        await this.userRepo.save(user);
        uploadedFiles.selfie = fileUrl;
        console.log('Selfie saved to database successfully');
      } catch (error) {
        console.error('Error uploading selfie:', error);
        console.error('Error stack:', error?.stack);
        throw new BadRequestException(
          `Failed to upload selfie: ${error?.message || 'Unknown error'}`,
        );
      }
    } else {
      console.log('No selfie file provided in upload request');
    }

    // Upload Driver's License
    if (files.driverLicense && files.driverLicense.length > 0) {
      const file = files.driverLicense[0];
      const fileUrl = await this.uploadFileToLinode(file);
      const existing = await this.licenseImgRepository.findOne({
        where: { user: { id: user.id } },
        relations: ['user'],
      });

      let licenseImage;
      if (existing) {
        existing.name = file.originalname;
        existing.url = fileUrl;
        existing.ext = path.extname(file.originalname).slice(1);
        licenseImage = await this.licenseImgRepository.save(existing);
      } else {
        licenseImage = this.licenseImgRepository.create({
          name: file.originalname,
          url: fileUrl,
          ext: path.extname(file.originalname).slice(1),
          user: user,
        });
        await this.licenseImgRepository.save(licenseImage);
      }
      user.licenseImage = licenseImage;
      uploadedFiles.driverLicense = fileUrl;
    }

    // Upload Vehicle License Plate
    if (files.vehicleLicensePlate && files.vehicleLicensePlate.length > 0) {
      const file = files.vehicleLicensePlate[0];
      const fileUrl = await this.uploadFileToLinode(file);
      const existing = await this.plateNumRepository.findOne({
        where: { user: { id: user.id } },
        relations: ['user'],
      });

      let plateImage;
      if (existing) {
        existing.name = file.originalname;
        existing.url = fileUrl;
        existing.ext = path.extname(file.originalname).slice(1);
        plateImage = await this.plateNumRepository.save(existing);
      } else {
        plateImage = this.plateNumRepository.create({
          name: file.originalname,
          url: fileUrl,
          ext: path.extname(file.originalname).slice(1),
          user: user,
        });
        await this.plateNumRepository.save(plateImage);
      }
      user.plateNumberImage = plateImage;
      uploadedFiles.vehicleLicensePlate = fileUrl;
    }

    // Upload Vehicle Registration
    if (files.vehicleRegistration && files.vehicleRegistration.length > 0) {
      const file = files.vehicleRegistration[0];
      const fileUrl = await this.uploadFileToLinode(file);
      const existing = await this.vehicleRegRepository.findOne({
        where: { user: { id: user.id } },
        relations: ['user'],
      });

      let vehicleRegImage;
      if (existing) {
        existing.name = file.originalname;
        existing.url = fileUrl;
        existing.ext = path.extname(file.originalname).slice(1);
        vehicleRegImage = await this.vehicleRegRepository.save(existing);
      } else {
        vehicleRegImage = this.vehicleRegRepository.create({
          name: file.originalname,
          url: fileUrl,
          ext: path.extname(file.originalname).slice(1),
          user: user,
        });
        await this.vehicleRegRepository.save(vehicleRegImage);
      }
      user.vehicleRegImage = vehicleRegImage;
      uploadedFiles.vehicleRegistration = fileUrl;
    }

    await this.userRepo.save(user);

    return {
      message: 'Documents uploaded successfully',
      data: uploadedFiles,
    };
  }

  async toggleOnlineStatus(
    driverId: string,
  ): Promise<{ message: string; isOnline: boolean; isApproved: boolean }> {
    const user = await this.userRepo.findOne({
      where: { id: driverId, role: UserRole.RIDER },
    });
    if (!user) throw new NotFoundException('Driver not found');

    // If trying to go online, check approval first
    if (!user.isOnline && !user.isApproved) {
      throw new BadRequestException(
        'Cannot go online. Admin approval is required.',
      );
    }

    // Toggle status (can always go offline)
    user.isOnline = !user.isOnline;
    await this.userRepo.save(user);

    return {
      message: user.isOnline ? 'Driver is now online' : 'Driver is now offline',
      isOnline: user.isOnline,
      isApproved: user.isApproved,
    };
  }

  async updateDriverEarnings(riderId: string, amount: number): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: riderId, role: UserRole.RIDER },
    });
    if (!user) throw new NotFoundException('Driver not found');

    const currentEarnings = Number(user.totalEarnings) || 0;
    user.totalEarnings = currentEarnings + amount;
    return this.userRepo.save(user);
  }

  async updateDeliveryCount(riderId: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: riderId, role: UserRole.RIDER },
    });
    if (!user) throw new NotFoundException('Driver not found');

    user.deliveriesCount = (user.deliveriesCount || 0) + 1;
    return this.userRepo.save(user);
  }

  async updateDriverStats(
    riderId: string,
    earningsAmount: number,
  ): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: riderId, role: UserRole.RIDER },
    });
    if (!user) throw new NotFoundException('Driver not found');

    // Update earnings
    const currentEarnings = Number(user.totalEarnings) || 0;
    user.totalEarnings = currentEarnings + earningsAmount;

    // Update delivery count
    user.deliveriesCount = (user.deliveriesCount || 0) + 1;

    return this.userRepo.save(user);
  }
}
