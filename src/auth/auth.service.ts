










































































































































































































































































































































































































































































































































































































































































































































































































































import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, Like, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { HttpService } from '@nestjs/axios';
import { User, UserRole } from './entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  CreateAuthDto,
  CreateAuthDtoDriver,
  LoginAuthDto,
} from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { DiverLicense } from './entities/license.entity';
import { Nin, RiderType } from './entities/nin';
import axios from 'axios';

import { Vehicle } from './entities/vehicle.entity';
import { CreateVehicleDto } from './dto/vehicle.dto';
import * as AWS from 'aws-sdk';
import { ProfileImage } from './entities/profile.entity';
import * as path from 'path';
import { plateNum } from './entities/plateNum.entity';
import { LicenseImg } from './entities/licenseImg.entity';
import { VehicleReg } from './entities/VehicleReg.entity';
import { SignupDriverDto } from './dto/signup-driver.dto';
import { MailService } from 'src/mail/mail.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly apiUrl: string;
  private s3: AWS.S3 | null;
  private bucketName: string | null;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(DiverLicense)
    private licenseRepository: Repository<DiverLicense>,
    @InjectRepository(Nin)
    private ninRepository: Repository<Nin>,
    @InjectRepository(Vehicle)
    private vehicleRepository: Repository<Vehicle>,
    @InjectRepository(ProfileImage)
    private readonly profileImageRepository: Repository<ProfileImage>,
    @InjectRepository(plateNum)
    private readonly plateImageRepository: Repository<plateNum>,
    @InjectRepository(LicenseImg)
    private readonly licenseImageRepository: Repository<LicenseImg>,
    @InjectRepository(VehicleReg)
    private readonly vehicleRegImageRepository: Repository<VehicleReg>,

    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly mailService: MailService,
  ) {
    this.apiUrl = this.configService.get<string>('API_URL');

    const accessKeyId = this.configService.get<string>('LINODE_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'LINODE_SECRET_ACCESS_KEY',
    );
    const endpoint = this.configService.get<string>('LINODE_ENDPOINT');
    const region = this.configService.get<string>('LINODE_REGION');
    const bucketName = this.configService.get<string>('LINODE_BUCKET_NAME');

    
    if (accessKeyId && secretAccessKey && endpoint && region && bucketName) {
      this.s3 = new AWS.S3({
        endpoint: endpoint,
        region: region,
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
        signatureVersion: 'v4',
        s3ForcePathStyle: true, 
        credentials: new AWS.Credentials(accessKeyId, secretAccessKey), 
      });
      this.bucketName = bucketName;
    } else {
      
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

  
  private generateFiveDigitOtp(): string {
    const n = Math.floor(10000 + Math.random() * 90000);
    return String(n);
  }

  private hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  private async setEmailVerificationOtp(user: User): Promise<string> {
    const otp = this.generateFiveDigitOtp();
    user.emailVerificationOtpHash = this.hashOtp(otp);
    user.emailVerificationOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); 
    await this.userRepository.save(user);
    return otp;
  }

  private async setPasswordResetOtp(user: User): Promise<string> {
    const otp = this.generateFiveDigitOtp();
    user.passwordResetOtpHash = this.hashOtp(otp);
    user.passwordResetOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.userRepository.save(user);
    return otp;
  }

  
  private computeRoleForUser(u: User): UserRole {
    if (u.role === UserRole.ADMIN) return UserRole.ADMIN;
    return u.role === UserRole.RIDER ? UserRole.RIDER : UserRole.CUSTOMER;
  }

  async issueTokensForUser(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
    user: Partial<User>;
  }> {
    const role = this.computeRoleForUser(user);
    const payload = { sub: user.id, email: user.email, role }; 

    const accessToken = await this.jwtService.signAsync(payload, {
      
      secret: this.configService.get<string>('ACCESS_TOKEN'),
    });

    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email },
      {
        
        secret: this.configService.get<string>('REFRESH_TOKEN'),
      },
    );

    const { password: _p, ...safe } = user;
    return { accessToken, refreshToken, user: safe };
  }

  async createUser(createUserDto: CreateAuthDto): Promise<User> {
    const { email, phoneNumber, password, firstName, lastName, role } =
      createUserDto;

    const existingUser = await this.userRepository.findOne({
      where: [{ email }, { phoneNumber }],
    });
    if (existingUser) {
      throw new ConflictException(
        'A user with this email or phone number already exists.',
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = this.userRepository.create({
      email,
      phoneNumber,
      password: hashedPassword,
      firstName,
      lastName,
      role,
    });
    const saved = await this.userRepository.save(user);
    const otp = await this.setEmailVerificationOtp(saved);
    await this.mailService.sendOtpEmail(
      saved.email,
      'Your verification code',
      otp,
    );
    return saved;
  }
  async createDriver(createUserDto: SignupDriverDto): Promise<User> {
    const {
      email,
      phoneNumber,
      password,
      firstName,
      lastName,

      driveCountry,
      driveCity,
    } = createUserDto;

    const existingUser = await this.userRepository.findOne({
      where: [{ email }, { phoneNumber }],
    });
    if (existingUser) {
      throw new ConflictException(
        'A user with this email or phone number already exists.',
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = this.userRepository.create({
      email,
      phoneNumber,
      password: hashedPassword,
      firstName,
      lastName,
      role: UserRole.RIDER,
    });
    const saved = await this.userRepository.save(user);
    const otp = await this.setEmailVerificationOtp(saved);

    await this.mailService.sendOtpEmail(
      saved.email,
      'Your verification code', 
      otp,
    );
    return saved;
  }

  async login(loginAuthDto: LoginAuthDto): Promise<{
    accessToken: string;
    refreshToken: string;
    user: Partial<User>;
  }> {
    const { email, password } = loginAuthDto;

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid email or password');

    
    if (user.deletedAt) {
      throw new UnauthorizedException(
        'This account has been deleted. Please contact admin for account restoration.',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid)
      throw new UnauthorizedException('Invalid email or password');

    if (!user.isEmailVerified) {
      const otp = await this.setEmailVerificationOtp(user);
      await this.mailService.sendOtpEmail(
        user.email,
        'Verify your account',
        otp,
      );
      throw new UnauthorizedException(
        'Email not verified. A verification code has been sent to your email.',
      );
    }

    return this.issueTokensForUser(user);
  }

  async verifyEmailOtp(otp: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: Partial<User>;
  }> {
    const incoming = this.hashOtp(otp);
    const user = await this.userRepository.findOne({
      where: { emailVerificationOtpHash: incoming },
    });
    if (!user) throw new NotFoundException('Invalid verification code');
    if (!user.emailVerificationOtpExpiresAt)
      throw new BadRequestException('No active verification code');
    if (user.emailVerificationOtpExpiresAt.getTime() < Date.now())
      throw new BadRequestException('Verification code expired');
    user.isEmailVerified = true;
    user.emailVerificationOtpHash = null;
    user.emailVerificationOtpExpiresAt = null;
    await this.userRepository.save(user);
    return this.issueTokensForUser(user);
  }

  async resendEmailOtp(email: string): Promise<void> {
    try {
      const user = await this.userRepository.findOne({ where: { email } });
      console.log('user', user);

      if (!user) throw new NotFoundException('User not found');
      if (user.isEmailVerified)
        throw new BadRequestException('Email already verified');
      const otp = await this.setEmailVerificationOtp(user);
      await this.mailService.sendOtpEmail(
        user.email,
        'Your verification code',
        otp,
      );
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  
  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');
    const otp = await this.setPasswordResetOtp(user);
    await this.mailService.sendOtpEmail(
      user.email,
      'Your password reset code',
      otp,
    );
  }

  async resendForgotPasswordOtp(email: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');
    const otp = await this.setPasswordResetOtp(user);
    await this.mailService.sendOtpEmail(
      user.email,
      'Your password reset code',
      otp,
    );
  }

  async ensureDefaultAdminAccount(): Promise<void> {
    const email =
      this.configService.get<string>('DEFAULT_ADMIN_EMAIL') ||
      'admin@errand.com';
    const password =
      this.configService.get<string>('DEFAULT_ADMIN_PASSWORD') ||
      '!Qwertyuiop112';
    const phone =
      this.configService.get<string>('DEFAULT_ADMIN_PHONE') || '0000000000';

    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) return;

    const hashed = await bcrypt.hash(password, 10);
    const admin = this.userRepository.create({
      email,
      phoneNumber: phone,
      password: hashed,
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMIN,
      isEmailVerified: true,
    });
    await this.userRepository.save(admin);
  }

  async resetPassword(
    email: string,
    otp: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt)
      throw new BadRequestException('No active reset code');
    if (user.passwordResetOtpExpiresAt.getTime() < Date.now())
      throw new BadRequestException('Reset code expired');
    const incoming = this.hashOtp(otp);
    if (incoming !== user.passwordResetOtpHash)
      throw new BadRequestException('Invalid reset code');
    user.passwordResetOtpHash = null;
    user.passwordResetOtpExpiresAt = null;
    user.password = await bcrypt.hash(newPassword, 10);
    await this.userRepository.save(user);
  }

  
  async findAll(): Promise<User[]> {
    const users = await this.userRepository.find({
      relations: [
        'card',
        'driverLicense',
        'nin',
        'vehicle',
        'vehicle_reg_image',
        'Profile_img',
        'plateNum_img',
        'licenseImg',
      ],
    });

    if (users.length === 0) throw new NotFoundException('No users found.');
    return users;
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: [
        'card',
        'driverLicense',
        'nin',
        'vehicle',
        'vehicle_reg_image',
        'Profile_img',
        'plateNum_img',
        'licenseImg',
      ],
    });

    if (!user) throw new NotFoundException(`User with ID ${id} not found.`);
    return user;
  }

  async findOneByEmail(email: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { email },
      relations: ['card', 'driverLicense', 'nin', 'vehicle'],
    });
    if (!user)
      throw new NotFoundException(`User with email ${email} not found.`);
    return user;
  }

  async update(id: string, updateAuthDto: UpdateAuthDto): Promise<User> {
    const user = await this.findOne(id);
    Object.assign(user, updateAuthDto);
    return this.userRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }

  async countUsers(): Promise<number> {
    try {
      return await this.userRepository.count();
    } catch (error) {
      throw error;
    }
  }

  async deleteAccount(
    userId: string,
    reason: string,
    additionalNotes?: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException('Admin accounts cannot be deleted');
    }

    if (user.deletedAt) {
      throw new BadRequestException('Account is already deleted');
    }

    
    user.deletedAt = new Date();
    user.deletedReason = additionalNotes
      ? `${reason} | Additional Notes: ${additionalNotes}`
      : reason;
    user.deletedBy = userId; 
    user.isOnline = false; 

    await this.userRepository.save(user);

    return {
      success: true,
      message:
        'Account deleted successfully. You can request account restoration from admin.',
    };
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<string> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid)
      throw new BadRequestException('Incorrect old password');

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedNewPassword;
    await this.userRepository.save(user);

    return 'Password changed successfully';
  }

  async getNinDetails(nin: string) {
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

  async getDriverLicenseDetails(licenseNo: string) {
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

  async getDrivers() {
    const drivers = await this.userRepository.find({
      where: { role: UserRole.RIDER },
      relations: [
        'driverLicense',
        'nin',
        'vehicle',
        'vehicle_reg_image',
        'Profile_img',
        'plateNum_img',
        'licenseImg',
      ],
    });
    return drivers;
  }

  async getCarBrands(): Promise<any> {
    try {
      const response = await axios.get(
        'https://vpic.nhtsa.dot.gov/api/vehicles/getallmakes?format=json',
      );
      return response.data.Results;
    } catch (error) {
      throw new Error(`Error fetching car brands: ${error.message}`);
    }
  }

  async getCarModels(make: string): Promise<any> {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMake/${make}?format=json`;
    try {
      const response = await axios.get(url);
      return response.data;
    } catch (error) {
      throw new Error(`Error fetching car models: ${error.message}`);
    }
  }

  async getCarModelDetails(make: string, model: string): Promise<any> {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMake/${make}?format=json`;
    try {
      const response = await axios.get(url);
      const filteredModels = response.data.Results.filter(
        (m: any) => m.Model_Name.toLowerCase() === model.toLowerCase(),
      );
      return { count: filteredModels.length, results: filteredModels };
    } catch (error) {
      throw new Error(`Error fetching car model details: ${error.message}`);
    }
  }

  
  async createOrUpdateVehicleByUserId(userId: string, dto: CreateVehicleDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['vehicle'],
    });
    if (!user) throw new NotFoundException(`User not found`);
    if (user.role === UserRole.RIDER)
      throw new Error('Only riders can create or update a vehicle');

    if (user.vehicle) await this.vehicleRepository.delete(user.vehicle.id);

    const existingVehicle = await this.vehicleRepository.findOne({
      where: { licensePlate: dto.licensePlate },
    });
    if (existingVehicle)
      throw new ConflictException('This plate number is already in use');

    const vehicle = this.vehicleRepository.create({ ...dto, user });
    await this.vehicleRepository.save(vehicle);

    user.vehicle = vehicle;
    await this.userRepository.save(user);

    return user;
  }

  async getVehicleByUserId(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['vehicle'],
    });
    if (!user) throw new NotFoundException(`User not found`);
    return user.vehicle;
  }

  async deleteVehicleByUserId(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['vehicle'],
    });
    if (!user) throw new NotFoundException(`User not found`);
    if (!user.vehicle) throw new NotFoundException('Vehicle not found');
    await this.vehicleRepository.delete(user.vehicle.id);
    return { message: 'Vehicle deleted successfully' };
  }

  
  async uploadFileToLinode(file: Express.Multer.File): Promise<string> {
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

  async createProfileImage(file: Express.Multer.File, user: User) {
    if (!file) throw new BadRequestException('Image file is required');
    const fileUrl = await this.uploadFileToLinode(file);

    const existing = await this.profileImageRepository.findOne({
      where: { user: { id: user.id } },
      relations: ['user'],
    });

    let profileImage;
    if (existing) {
      existing.name = file.originalname;
      existing.url = fileUrl;
      existing.ext = path.extname(file.originalname).slice(1);
      profileImage = await this.profileImageRepository.save(existing);
    } else {
      profileImage = this.profileImageRepository.create({
        name: file.originalname,
        url: fileUrl,
        ext: path.extname(file.originalname).slice(1),
        user: user,
      });
      await this.profileImageRepository.save(profileImage);
    }

    user.profileImage = profileImage;
    await this.userRepository.save(user);

    return { message: 'Profile image uploaded successfully', fileUrl };
  }

  async createPlateNumImage(file: Express.Multer.File, user: User) {
    if (!file) throw new BadRequestException('Image file is required');
    const fileUrl = await this.uploadFileToLinode(file);

    const existing = await this.plateImageRepository.findOne({
      where: { user: { id: user.id } },
      relations: ['user'],
    });

    let plateImage;
    if (existing) {
      existing.name = file.originalname;
      existing.url = fileUrl;
      existing.ext = path.extname(file.originalname).slice(1);
      plateImage = await this.plateImageRepository.save(existing);
    } else {
      plateImage = this.plateImageRepository.create({
        name: file.originalname,
        url: fileUrl,
        ext: path.extname(file.originalname).slice(1),
        user: user,
      });
      await this.plateImageRepository.save(plateImage);
    }

    user.plateNumberImage = plateImage;
    await this.userRepository.save(user);

    return { message: 'Plate number image uploaded successfully', fileUrl };
  }

  async createVehicleImage(file: Express.Multer.File, user: User) {
    if (!file) throw new BadRequestException('Image file is required');
    const fileUrl = await this.uploadFileToLinode(file);

    const existing = await this.vehicleRegImageRepository.findOne({
      where: { user: { id: user.id } },
      relations: ['user'],
    });

    let vehicleImage;
    if (existing) {
      existing.name = file.originalname;
      existing.url = fileUrl;
      existing.ext = path.extname(file.originalname).slice(1);
      vehicleImage = await this.vehicleRegImageRepository.save(existing);
    } else {
      vehicleImage = this.vehicleRegImageRepository.create({
        name: file.originalname,
        url: fileUrl,
        ext: path.extname(file.originalname).slice(1),
        user: user,
      });
      await this.vehicleRegImageRepository.save(vehicleImage);
    }

    user.vehicleRegImage = vehicleImage;
    await this.userRepository.save(user);

    return {
      message: 'Vehicle registration image uploaded successfully',
      fileUrl,
    };
  }

  async createLicenseImage(file: Express.Multer.File, user: User) {
    if (!file) throw new BadRequestException('Image file is required');
    const fileUrl = await this.uploadFileToLinode(file);

    const existing = await this.licenseImageRepository.findOne({
      where: { user: { id: user.id } },
      relations: ['user'],
    });

    let licenseImage;
    if (existing) {
      existing.name = file.originalname;
      existing.url = fileUrl;
      existing.ext = path.extname(file.originalname).slice(1);
      licenseImage = await this.licenseImageRepository.save(existing);
    } else {
      licenseImage = this.licenseImageRepository.create({
        name: file.originalname,
        url: fileUrl,
        ext: path.extname(file.originalname).slice(1),
        user: user,
      });
      await this.licenseImageRepository.save(licenseImage);
    }

    user.licenseImage = licenseImage;
    await this.userRepository.save(user);

    return { message: 'License image uploaded successfully', fileUrl };
  }
}
