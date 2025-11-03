import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminGuard } from 'src/guards/admin.guard';
import { PricingService } from './pricing.service';
import {
  CreatePricingSettingsDto,
  UpdatePricingSettingsDto,
} from './dto/create-pricing-settings.dto';

@ApiTags('pricing')
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('/settings')
  @ApiOperation({ summary: 'Fetch current pricing settings (public)' })
  @ApiOkResponse()
  async currentSettings() {
    const settings = await this.pricingService.getCurrentSettings();
    return {
      success: true,
      message: 'Pricing settings fetched successfully',
      data: settings,
    };
  }

  @Get('/settings/all')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all pricing settings (Admin only)' })
  @ApiOkResponse()
  async listSettings() {
    const settings = await this.pricingService.getSettingsList();
    return {
      success: true,
      message: 'Pricing settings list fetched successfully',
      data: settings,
    };
  }

  @Put('/settings/:id')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update pricing settings (Admin only)' })
  @ApiOkResponse()
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePricingSettingsDto,
  ) {
    const settings = await this.pricingService.updateSettings(id, dto);
    return {
      success: true,
      message: 'Pricing settings updated successfully',
      data: settings,
    };
  }

  @Post('/settings')
  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create pricing settings (Admin only)' })
  @ApiOkResponse()
  async create(@Body() dto: CreatePricingSettingsDto) {
    const settings = await this.pricingService.createSettings(dto);
    return {
      success: true,
      message: 'Pricing settings created successfully',
      data: settings,
    };
  }
}
