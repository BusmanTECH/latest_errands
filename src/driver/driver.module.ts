
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { User } from '../auth/entities/user.entity';
import { ProfileImage } from '../auth/entities/profile.entity';
import { Nin } from '../auth/entities/nin';
import { DiverLicense } from '../auth/entities/license.entity';
import { Vehicle } from '../auth/entities/vehicle.entity';
import { VehicleReg } from '../auth/entities/VehicleReg.entity';
import { plateNum } from '../auth/entities/plateNum.entity';
import { LicenseImg } from '../auth/entities/licenseImg.entity';
import { DriverService } from './driver.service';
import { DriverController } from './driver.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      ProfileImage,
      Nin,
      DiverLicense,
      Vehicle,
      VehicleReg,
      plateNum,
      LicenseImg,
    ]),
    HttpModule,
  ],
  controllers: [DriverController],
  providers: [DriverService],
  exports: [DriverService],
})
export class DriverModule {}


