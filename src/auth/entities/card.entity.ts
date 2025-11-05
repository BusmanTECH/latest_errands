
import {  Entity, PrimaryGeneratedColumn, Column } from 'typeorm';


@Entity()
export class Card{
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({nullable : true, length: 190, type: 'varchar'})
    card_name?: string;

    @Column({ type: 'varchar', length: 190, nullable: false })
    card_number: string;

    @Column({ type: 'varchar', length: 190, nullable: false  })
    card_date: string;

    @Column({ type: 'varchar', length: 190, nullable: false  })
    card_digit : string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    authorization_code?: string; 


    constructor(card :Partial<Card>){
        Object.assign(this, card)
    }
}   