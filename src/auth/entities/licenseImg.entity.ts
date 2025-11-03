/* eslint-disable prettier/prettier */
import { Entity, JoinColumn, OneToOne } from 'typeorm';
import { AbstractFileEntity } from './abstract.entity';
import { User } from './user.entity';

@Entity()
export class LicenseImg extends AbstractFileEntity<LicenseImg> {

    @OneToOne(() => User, (user) => user.licenseImage, { onDelete: 'CASCADE' })
    @JoinColumn()
    user: User;
        
    constructor(licenseImg: Partial<LicenseImg>) {
        super(licenseImg);
    }
}