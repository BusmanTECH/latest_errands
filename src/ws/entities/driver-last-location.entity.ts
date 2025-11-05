

import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';
@Entity('driver_last_location')
@Unique(['driverId'])
export class DriverLastLocation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column('uuid') driverId: string;
  @Column('decimal', {precision:10, scale:6}) lat: number;
  @Column('decimal', {precision:10, scale:6}) lng: number;
  @Column({type:'bigint'}) ts: string; 
}


