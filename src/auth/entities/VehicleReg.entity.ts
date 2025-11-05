
import { Entity, JoinColumn, OneToOne } from 'typeorm';
import { AbstractFileEntity } from './abstract.entity';
import { User } from './user.entity';

@Entity()
export class VehicleReg extends AbstractFileEntity<VehicleReg> {


    @OneToOne(() => User, (user) => user.vehicleRegImage, { onDelete: 'CASCADE' })
    @JoinColumn()
    user: User;

    constructor(vehicleReg: Partial<VehicleReg>) {
        super(vehicleReg);
    }

   
}