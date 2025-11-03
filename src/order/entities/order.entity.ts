/* eslint-disable prettier/prettier */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum OrderScope {
  LOCAL = 'local',
  INTERSTATE = 'interstate',
  INTERNATIONAL = 'international',
}

export enum VehicleType {
  SCOOTER = 'bicycle',
  BIKE = 'bike',
  MOTORCYCLE = 'motorcycle',
  VAN = 'van',
  CAR = 'car',
}

export enum DeliveryType {
  INSTANT = 'instant',
  SCHEDULE = 'schedule',
}

export enum ShippingType {
  SINGLE = 'single',
  MULTIPLE = 'multiple',
}

export enum PackageCategory {
  STANDARD = 'standard',
  FRAGILE = 'fragile',
  PERISHABLE = 'perishable',
  OTHER = 'other',
}
export enum ParishableHandling {
  COOLER = 'cooler',
  WARMER = 'warmer',
}

export enum OrderStatus {
  NEW = 'new',
  ASSIGNED = 'assigned',
  ACCEPTED = 'accepted',
  TOPICKUP = 'toPickup',
  TODESTINATION = 'toDestination',
  STARTED = 'started',
  ARRIVED = 'arrived',
  DELAYED = 'delayed',
  COLLECTED = 'collected',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  INITIATED = 'INITIATED',
  PENDING = 'PENDING',
  SUCCESSFUL = 'SUCCESSFUL',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: VehicleType,
    nullable: true,
  })
  vehicle: VehicleType;

  @Column({
    type: 'enum',
    enum: PackageCategory,
    nullable: true,
  })
  packageCategory: PackageCategory;

  @Column({ type: 'jsonb', nullable: true })
  pickupLocation: any;

  @Column({ type: 'jsonb', nullable: true })
  deliveryLocation: any;

  // PostGIS geometry for pickup coordinates
  // Using text type - will be converted to PostGIS geometry in queries using ST_GeomFromText
  @Column({
    type: 'text',
    nullable: true,
  })
  pickupCoordinates: string; // Stored as PostGIS geometry string, format: "POINT(longitude latitude)"

  // PostGIS geometry for delivery coordinates
  @Column({
    type: 'text',
    nullable: true,
  })
  deliveryCoordinates: string; // Stored as PostGIS geometry string, format: "POINT(longitude latitude)"

  @Column({ type: 'varchar', nullable: true })
  closeLandmark: string;

  @Column({
    type: 'enum',
    enum: DeliveryType,
    nullable: true,
  })
  deliveryType: DeliveryType;

  @Column({
    type: 'enum',
    enum: ShippingType,
    nullable: true,
  })
  shippingType: ShippingType;

  @Column({ type: 'text', nullable: true })
  scheduledPickupTime: string;

  @Column({ type: 'jsonb', nullable: true })
  receiverDetails: any;

  @Column({ type: 'jsonb', nullable: true })
  pickupDetails: any;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.NEW,
  })
  status: OrderStatus;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.INITIATED,
  })
  paymentStatus: PaymentStatus;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    default: PaymentMethod.CASH,
  })
  paymentMethod: PaymentMethod;

  @Column({ type: 'text', nullable: true })
  instruction: string;

  @Column({
    type: 'enum',
    enum: ParishableHandling,
    nullable: true,
  })
  parishableHandling: ParishableHandling;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', nullable: true })
  packageSize: string;

  @Column({ type: 'text', array: true, nullable: true })
  images: string[];

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  distance: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  charge: number;

  @Column({ type: 'varchar', nullable: true })
  trackingCode: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'driverId' })
  driver: User;

  @Column({ type: 'uuid', nullable: true })
  driverId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid', nullable: true })
  userId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  eta: number;

  @Column({ type: 'timestamp', nullable: true })
  pickupTime: Date;

  @Column({ type: 'timestamp', nullable: true })
  deliveryTime: Date;

  @Column({ type: 'timestamp', nullable: true })
  acceptTime: Date;

  @Column({ type: 'timestamp', nullable: true })
  startTime: Date;

  @Column({ type: 'timestamp', nullable: true })
  completeTime: Date;

  @Column({ type: 'timestamp', nullable: true })
  cancelTime: Date;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date;

  @Column({ type: 'varchar', nullable: true })
  paymentReference: string;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
