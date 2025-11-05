
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Card } from './card.entity';
import { Nin } from './nin';

import { DiverLicense } from './license.entity';
import { Exclude, instanceToPlain } from 'class-transformer';
import { Vehicle } from './vehicle.entity';
import { VehicleReg } from './VehicleReg.entity';
import { ProfileImage } from './profile.entity';
import { plateNum } from './plateNum.entity';
import { LicenseImg } from './licenseImg.entity';
import { Wallet } from '../../wallet/entities/wallet.entity';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  CUSTOMER = 'customer',
  RIDER = 'rider',
}
export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
}
export enum GenderType {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}






@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 140, unique: true, nullable: false })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 140, unique: true, nullable: false })
  email: string;

  @Column({ type: 'varchar', nullable: false })
  @Exclude()
  password?: string;

  @Column({ type: 'varchar', nullable: false })
  firstName?: string;

  @Column({ type: 'varchar', nullable: false })
  lastName?: string;

  @Column({ type: 'varchar', nullable: true })
  gender?: string;

  @Column({ type: 'date', nullable: true })
  birthDate?: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
    nullable: false,
  })
  role: UserRole;

  @Column({ type: 'boolean', default: false })
  isEmailVerified: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  emailVerificationOtpHash?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  emailVerificationOtpExpiresAt?: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordResetOtpHash?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetOtpExpiresAt?: Date | null;

  @Column({
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 4,
    nullable: false,
  })
  averageRating: number;

  @Column({ type: 'boolean', default: false })
  isOnline: boolean;

  @Column({ type: 'boolean', default: false })
  isApproved: boolean;
  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.CASH })
  defaultPaymentMethod: PaymentMethod;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    nullable: false,
  })
  totalEarnings: number;

  @Column({ type: 'integer', default: 0, nullable: false })
  deliveriesCount: number;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  deletedReason?: string | null;

  @Column({ type: 'uuid', nullable: true })
  deletedBy?: string | null;

  @OneToOne(() => Card, {
    cascade: true,
    nullable: true,
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
  })
  @JoinColumn()
  card?: Card;

  @OneToOne(() => DiverLicense, (driverLicense) => driverLicense.user, {
    cascade: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn()
  driverLicense?: DiverLicense;

  @OneToOne(() => Nin, (nin) => nin.user, {
    cascade: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn()
  nin?: Nin;

  
  @OneToOne(() => Vehicle, (vehicle) => vehicle.user, {
    cascade: true,
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn()
  vehicle?: Vehicle;

  @OneToOne(() => VehicleReg, (vehicleImage) => vehicleImage.user, {
    cascade: true,
    nullable: true,
  })
  @JoinColumn()
  vehicleRegImage?: VehicleReg;

  @OneToOne(() => ProfileImage, (profileImage) => profileImage.user, {
    cascade: true,
    nullable: true,
  })
  @JoinColumn()
  profileImage?: ProfileImage;

  @OneToOne(() => plateNum, (plateImage) => plateImage.user, {
    cascade: true,
    nullable: true,
  })
  @JoinColumn()
  plateNumberImage?: plateNum;

  @OneToOne(() => LicenseImg, (licenseImage) => licenseImage.user, {
    cascade: true,
    nullable: true,
  })
  @JoinColumn()
  licenseImage?: LicenseImg;

  @OneToOne(() => Wallet, (wallet) => wallet.user, {
    cascade: true,
    nullable: true,
  })
  @JoinColumn()
  wallet?: Wallet;

  toJSON() {
    return instanceToPlain(this, { excludePrefixes: ['_'] });
  }

  constructor(user: Partial<User>) {
    Object.assign(this, user);
  }
}
