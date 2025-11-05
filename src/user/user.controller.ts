
import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Res,
  UseGuards,
  Patch,
  Body,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from './user.service';
import { AuthGuard } from '@nestjs/passport';
import { Users } from 'src/decorators/user.decorator';
import { Response } from 'express';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { PaymentMethod } from 'src/auth/entities/user.entity';

@Controller('user')
@UseGuards(AuthGuard('jwt'))
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('/profile')
  async getUserProfile(@Users('sub') userId: string, @Res() res: Response) {
    try {
      const user = await this.userService.getUserProfile(userId);
      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,

        message: 'User profile fetched successfully',
        data: user,
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to fetch user profile',
      });
    }
  }

  @Patch('/profile')
  async updateUserProfile(
    @Users('sub') userId: string,
    @Body()
    body: Partial<{
      firstName: string;
      lastName: string;
      phoneNumber: string;
      defaultPaymentMethod: PaymentMethod;
    }>,
    @Res() res: Response,
  ) {
    try {
      const updated = await this.userService.updateUserProfile(userId, body);
      return res.status(HttpStatus.OK).json({
        status: HttpStatus.OK,
        message: 'User profile updated successfully',
        data: updated,
      });
    } catch (error) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to update user profile',
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
      await this.userService.changePassword(
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
      const result = await this.userService.uploadProfilePicture(userId, file);
      return res.status(HttpStatus.CREATED).json({
        status: HttpStatus.CREATED,
        message: result.message,
        data: { fileUrl: result.fileUrl },
      });
    } catch (error) {
      console.log(error);
      return res.status(HttpStatus.BAD_REQUEST).json({
        status: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to upload profile picture',
      });
    }
  }
}
