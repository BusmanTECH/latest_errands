
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod, User, UserRole } from '../auth/entities/user.entity';
import * as bcrypt from 'bcrypt';
import { ProfileImage } from '../auth/entities/profile.entity';
import * as AWS from 'aws-sdk';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UserService {
  private s3: AWS.S3 | null;
  private bucketName: string | null;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(ProfileImage)
    private readonly profileImageRepo: Repository<ProfileImage>,
    private readonly configService: ConfigService,
  ) {
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

  async getUserProfile(id: string) {
    const user = await this.userRepo.findOne({
      where: { id, role: UserRole.USER },
      relations: ['profileImage'],
    });
    if (!user) throw new NotFoundException('User not found');

    
    const averageRating = Number(user.averageRating) || 0;

    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      profileImage: user.profileImage,
      isEmailVerified: user.isEmailVerified,
      deliveriesCount: user.deliveriesCount,

      averageRating: Math.round(averageRating * 10) / 10,
      defaultPaymentMethod: user.defaultPaymentMethod,
    };
  }

  async updateUserProfile(
    id: string,
    dto: Partial<{
      firstName: string;
      lastName: string;
      phoneNumber: string;
      defaultPaymentMethod: PaymentMethod;
    }>,
  ) {
    const user = await this.userRepo.findOne({
      where: { id, role: UserRole.USER },
    });
    if (!user) throw new NotFoundException('User not found');

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;

    if (
      dto.defaultPaymentMethod !== undefined &&
      dto.defaultPaymentMethod !== PaymentMethod.CASH &&
      dto.defaultPaymentMethod !== PaymentMethod.CARD
    )
      throw new BadRequestException('Invalid payment method');
    if (dto.defaultPaymentMethod !== undefined)
      user.defaultPaymentMethod = dto.defaultPaymentMethod;
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

    return this.userRepo.save(user);
  }

  async changePassword(
    id: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<string> {
    const user = await this.userRepo.findOne({
      where: { id, role: UserRole.USER },
    });
    if (!user) throw new NotFoundException('User not found');

    
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      throw new BadRequestException('Incorrect old password');
    }

    
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
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ fileUrl: string; message: string }> {
    if (!file) throw new BadRequestException('Image file is required');

    const user = await this.userRepo.findOne({
      where: { id: userId, role: UserRole.USER },
      relations: ['profileImage'],
    });
    if (!user) throw new NotFoundException('User not found');

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
}
