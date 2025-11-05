
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule, HttpService } from '@nestjs/axios'; 
import { User } from './entities/user.entity';
import { Card } from './entities/card.entity';
import { DiverLicense } from './entities/license.entity';
import { Nin } from './entities/nin';
import { Vehicle } from './entities/vehicle.entity';
import { ProfileImage } from './entities/profile.entity';
import { plateNum } from './entities/plateNum.entity';
import { LicenseImg } from './entities/licenseImg.entity';
import { VehicleReg } from './entities/VehicleReg.entity';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { MailModule } from 'src/mail/mail.module';


@Module({
  imports: [
    TypeOrmModule.forFeature([User, Card, DiverLicense, Nin, Vehicle, ProfileImage, plateNum, LicenseImg, VehicleReg, ]),
    ConfigModule,
    HttpModule, 
    MailModule,
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('ACCESS_TOKEN'),
        
        signOptions: {},
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [TypeOrmModule, HttpModule,  AuthService, JwtModule, PassportModule], 
  controllers: [AuthController],
  providers: [AuthService, JwtModule, JwtStrategy], 
})
export class AuthModule {}

