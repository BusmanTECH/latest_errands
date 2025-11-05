
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('pricing_settings')
export class PricingSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true, default: 'general' })
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  costPerKm: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  minCost: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  maxCost: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  distanceRang: number;

  @Column('jsonb', { nullable: true })
  deliveryTypePricing?: {
    instant?: number;
    schedule?: number;
  };

  @Column('jsonb', { nullable: true })
  perKmPricing?: {
    normal?: number;
    express?: number;
  };

  @Column('jsonb', { nullable: true })
  surcharges?: {
    rainPerKm?: number;
    trafficPerKm?: number;
  };

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  orderPercentage: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: -1000 })
  limitAmount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

