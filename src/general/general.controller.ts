
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Res,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { GeneralService } from './general.service';
import { multerOptions } from './multer.config';

@ApiTags('general')
@Controller('general')
export class GeneralController {
  constructor(private readonly generalService: GeneralService) {}

  @Get('brands')
  async getCarBrands(): Promise<any> {
    return this.generalService.getCarBrands();
  }

  @Get('car/:make')
  async getCarModels(@Param('make') make: string): Promise<any> {
    return this.generalService.getCarModels(make);
  }

  @Get('model/:make/:model')
  async getCarModelDetails(
    @Param('make') make: string,
    @Param('model') model: string,
  ): Promise<any> {
    return this.generalService.getCarModelDetails(make, model);
  }

  @Get('callback')
  async cardCallback(
    @Query('success') success: string,
    @Query('message') message: string,
    @Query('reference') reference: string,
    @Res() res: Response,
  ) {
    const isSuccess = success === 'true' || success === '1';
    const displayMessage =
      message ||
      (isSuccess
        ? 'Your card has been added successfully!'
        : 'Failed to add card. Please try again.');
    const ref = reference || 'N/A';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Card ${isSuccess ? 'Added' : 'Failed'}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 500px;
      width: 100%;
      padding: 40px;
      text-align: center;
      animation: slideUp 0.5s ease-out;
    }
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      ${
        isSuccess
          ? 'background: #10b981; color: #ffffff;'
          : 'background: #ef4444; color: #ffffff;'
      }
    }
    .title {
      font-size: 28px;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 12px;
    }
    .message {
      font-size: 16px;
      color: #6b7280;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .reference {
      font-size: 12px;
      color: #9ca3af;
      margin-bottom: 32px;
      padding: 12px;
      background: #f9fafb;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
    }
    .close-button {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      border: none;
      padding: 14px 32px;
      font-size: 16px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s ease;
      width: 100%;
      max-width: 200px;
    }
    .close-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
    }
    .close-button:active {
      transform: translateY(0);
    }
    .success-checkmark {
      stroke-dasharray: 80;
      stroke-dashoffset: 80;
      animation: drawCheck 0.6s ease-out forwards;
      animation-delay: 0.2s;
    }
    @keyframes drawCheck {
      to {
        stroke-dashoffset: 0;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      ${
        isSuccess
          ? `<svg width="50" height="50" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path class="success-checkmark" d="M15 25 L22 32 L35 18" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>`
          : `<svg width="50" height="50" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="25" cy="25" r="20" stroke="currentColor" stroke-width="3"/>
            <path d="M18 18 L32 32 M32 18 L18 32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
          </svg>`
      }
    </div>
    <h1 class="title">${isSuccess ? 'Card Added Successfully!' : 'Card Addition Failed'}</h1>
    <p class="message">${displayMessage}</p>
    <div class="reference">Reference: ${ref}</div>
    <button class="close-button" onclick="window.close()">Close</button>
    <script>
      if (window.opener) {
        setTimeout(function() {
          window.close();
        }, 3000);
      }
    </script>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  @Post('upload/image')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('image', multerOptions))
  @ApiOperation({ 
    summary: 'Upload an image file and get URL',
    description: 'Available to all authenticated users (users, riders, admins)'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Image file (JPEG, PNG, GIF, WebP, max 5MB)',
        },
      },
    },
  })
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }

    const imageUrl = await this.generalService.uploadImage(file);

    return {
      success: true,
      message: 'Image uploaded successfully',
      data: {
        url: imageUrl,
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
      },
    };
  }
}
