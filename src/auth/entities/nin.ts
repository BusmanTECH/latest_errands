
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToOne,
    JoinColumn
} from 'typeorm';
import { User } from './user.entity';


export enum RiderType {
    DRIVER = "driver",
    RIDER = "rider",
    REST = "rest"
}

@Entity()
export class Nin {  
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: 'date', nullable: true })
    birthDate?: string;

    @Column({ type: 'varchar', nullable: true })
    gender?: string;

    
    

    @Column({ type: "enum", enum: RiderType, default: RiderType.REST, nullable: false })
    riderType: RiderType;

    @Column({ type: 'text', nullable: true })
    employmentStatus: string;

    @Column({ type: 'varchar', nullable: true })
    trackingId: string;

    @Column({ type: 'varchar', nullable: true })
    residenceAdressLine1: string;

    @Column({ type: 'varchar', nullable: false })
    telephoneNo: string;

    @OneToOne(() => User, (user) => user.nin, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn()
    user?: User;
    

    constructor(nin: Partial<Nin>) {
        Object.assign(this, nin);
    }
}
