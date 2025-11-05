

import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Charge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('jsonb', { nullable: false, default: {} })
  stateCharges: Record<string, Record<string, number>>;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  percentageCharge: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
