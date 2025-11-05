


import { Controller, Get, Post, Body } from '@nestjs/common';
import { ChargesService } from './charges.service';
import { SetChargesDto } from './dto/charges.dto';

@Controller('charges')
export class ChargesController {
  constructor(private readonly chargesService: ChargesService) {}



@Post('set')
async setCharges(@Body() body: SetChargesDto) {
  const charge = await this.chargesService.setCharges(body.stateCharges);
  return {
    message: 'Charges updated successfully',
    stateCharges: charge.stateCharges,
  };
}

  @Get()
async getCharges() {
  const charge = await this.chargesService.getCharges();
  return {
    message: 'Current charge configuration retrieved successfully',
    stateCharges: charge?.stateCharges ?? {},
  };
}

@Get('states')
async getAllStateCharges() {
  const stateCharges = await this.chargesService.getAllStateCharges();
  return {
    message: 'State charges retrieved successfully',
    stateCharges,
  };
}

@Post('set-percentage')
async setPercentageCharge(
  @Body('percentageCharge') percentageCharge: number,
) {
  const charge = await this.chargesService.setPercentageCharge(percentageCharge);
  return {
    message: 'Percentage charge updated successfully',
    percentageCharge: charge.percentageCharge,
  };
}
}
