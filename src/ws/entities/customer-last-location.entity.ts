

import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';
@Entity('customer_last_location')
@Unique(['userId'])
export class CustomerLastLocation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') userId: string;
  @Column('decimal', {precision:10, scale:6}) lat: number;
  @Column('decimal', {precision:10, scale:6}) lng: number;
  @Column({type:'bigint'}) ts: string;
}
