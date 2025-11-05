

import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
@Entity('order_track')
export class OrderTrack {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') orderId: string;
  @Column('jsonb', { default: [] })
  path: Array<{ lat:number; lng:number; ts:number }>;
  @Column({type:'bigint', nullable:true}) lastTs?: string;
}
