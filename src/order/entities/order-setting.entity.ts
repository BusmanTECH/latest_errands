/* eslint-disable prettier/prettier */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('order_settings')
export class OrderSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true, default: 'general' })
  name: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: false })
  costPerKm: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: false })
  minCost: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: false })
  maxCost: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: false })
  distanceRang: number;

  @Column({ type: 'jsonb', nullable: true })
  deliveryTypePricing: {
    instant?: number;
    schedule?: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  perKmPricing: {
    normal?: number;
    express?: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  surcharges: {
    rainPerKm?: number;
    trafficPerKm?: number;
  };

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 10,
  })
  orderPercentage: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: -1000,
  })
  limitAmount: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
