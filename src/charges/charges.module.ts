

import { Module } from '@nestjs/common';
import { ChargesController } from './charges.controller';
import { ChargesService } from './charges.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Charge } from './entities/charge.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Charge])],
  controllers: [ChargesController],
  providers: [ChargesService],
  exports: [ChargesService],
})
export class ChargesModule {}
