
import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from 'src/auth/auth.service';
import * as AWS from 'aws-sdk';

@Injectable()
export class GeneralService {
  private readonly logger = new Logger(GeneralService.name);
  private s3: AWS.S3 | null;
  private bucketName: string | null;

  constructor(
    private readonly authService: AuthService,
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
        accessKeyId,
        secretAccessKey,
        endpoint,
        region,
        s3ForcePathStyle: true,
        signatureVersion: 'v4',
      });
      this.bucketName = bucketName;
      this.logger.log('Linode Object Storage initialized');
    } else {
      this.logger.warn(
        'Linode Object Storage not configured. Image upload will not work.',
      );
    }
  }

  async getCarBrands(): Promise<any> {
    return this.authService.getCarBrands();
  }

  async getCarModels(make: string): Promise<any> {
    return this.authService.getCarModels(make);
  }

  async getCarModelDetails(make: string, model: string): Promise<any> {
    return this.authService.getCarModelDetails(make, model);
  }

  
  async uploadImage(file: Express.Multer.File): Promise<string> {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`,
      );
    }

    
    const maxSize = 5 * 1024 * 1024; 
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of 5MB`,
      );
    }

    if (!this.s3 || !this.bucketName) {
      throw new BadRequestException(
        'Image upload service is not configured. Please contact administrator.',
      );
    }

    
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const fileExtension = file.originalname.split('.').pop() || 'jpg';
    const fileName = `uploads/images/${timestamp}-${randomString}.${fileExtension}`;

    const params = {
      Bucket: this.bucketName,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read',
    };

    try {
      const uploadResult = await this.s3.upload(params).promise();
      this.logger.log(`Image uploaded successfully: ${uploadResult.Location}`);
      return uploadResult.Location;
    } catch (error) {
      this.logger.error('Error uploading image to Linode Object Storage:', error);
      throw new BadRequestException(
        'Failed to upload image. Please try again later.',
      );
    }
  }
}


