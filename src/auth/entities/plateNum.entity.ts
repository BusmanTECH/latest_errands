/* eslint-disable prettier/prettier */
import { Entity, JoinColumn, OneToOne } from 'typeorm';
import { AbstractFileEntity } from './abstract.entity';
import { User } from './user.entity';

@Entity()
export class plateNum extends AbstractFileEntity<plateNum> {

    @OneToOne(() => User, (user) => user.plateNumberImage, { onDelete: 'CASCADE' })
    @JoinColumn()
    user: User;

        
    constructor(plateNum: Partial<plateNum>) {
        super(plateNum);
    }
}