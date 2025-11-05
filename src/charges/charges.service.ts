


import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Charge } from './entities/charge.entity';
import { IsNull, Not, Repository } from 'typeorm';

@Injectable()
export class ChargesService {
  constructor(
    @InjectRepository(Charge)
    private readonly chargeRepo: Repository<Charge>,
  ) {}


  


async setCharges(stateCharges: Record<string, Record<string, number>>): Promise<Charge> {
  let charge = await this.chargeRepo.findOne({ where: {} });

  if (charge) {
    charge.stateCharges = stateCharges;
  } else {
    charge = this.chargeRepo.create({ stateCharges });
  }

  return this.chargeRepo.save(charge);
}



  
  async getCharges(): Promise<Record<string, Record<string, number>>> {
    const charge = await this.chargeRepo.findOne({ where: {} });
    return charge?.stateCharges || {};
  }
  

  async getAllStateCharges(): Promise<Record<string, Record<string, number>>> {
    const charge = await this.chargeRepo.findOne({
      where: { stateCharges: Not(IsNull()) },
      order: { createdAt: 'DESC' },
    });
  
    if (!charge) {
      return {};
    }
  
    return charge.stateCharges || {};
  }
  
 
 async setPercentageCharge(percentageCharge: number): Promise<Charge> {
  let charge = await this.chargeRepo.findOne({ where: {} });

  if (charge) {
    
    charge.percentageCharge = percentageCharge;
  } else {
    
    charge = this.chargeRepo.create({ percentageCharge, stateCharges: {} });
  }

  
  return this.chargeRepo.save(charge);
}  
  
}
