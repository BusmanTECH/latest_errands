
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToOne,
    JoinColumn,
  } from 'typeorm';
  import { User } from './user.entity';
import { Exclude } from 'class-transformer';
  
@Entity()
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  vehicleType: string;

  @Column({ nullable: true })
  vehicleBrand?: string;

  @Column({ nullable: true })
  vehicleYear?: string;

  @Column()
  vehicleColor: string;

  @Column({ unique: true })
  licensePlate: string;

  @Column('float')
  vehicleCapacity: number;

  @Column()
  unit: string;

  @Column({ nullable: true })
  specialEquipment?: string;

 
 @OneToOne(() => User, (user) => user.vehicle)
 @Exclude()
 user?: User;
 


  constructor(vehicle: Partial<Vehicle>) {
    Object.assign(this, vehicle);
}

}
