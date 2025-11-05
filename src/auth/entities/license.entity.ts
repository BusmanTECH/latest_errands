    
    import {
        Entity,
        PrimaryGeneratedColumn,
        Column,
        OneToOne,
        JoinColumn,

    } from 'typeorm';
    import { User } from './user.entity';


    @Entity()
    export class DiverLicense {
        @PrimaryGeneratedColumn("uuid")
        id: string;

        @Column({ type: 'varchar', nullable: false })
        licenseNo: string;

        @Column({ type: 'date', nullable: false })
        birthdate: string;

        @Column({ type: 'varchar', nullable: false })
        gender: string;

        @Column({ type: 'text', nullable: true })
        photo?: string; 

        @Column({ type: 'date', nullable: false })
        issuedDate: string;

        @Column({ type: 'date', nullable: false })
        expiryDate: string;

        @Column({ type: 'varchar', nullable: false })
        stateOfIssue: string;

        @OneToOne(() => User, (user) => user.driverLicense, { cascade: ["insert", "update"], nullable: true, onDelete: 'SET NULL' })
        @JoinColumn()
        user?: User;
        
        constructor(user: Partial<DiverLicense>) {
            Object.assign(this, user);
        }
    }
