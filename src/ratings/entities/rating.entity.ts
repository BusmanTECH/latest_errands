
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Order } from '../../order/entities/order.entity';

export enum RatedUserRole {
  USER = 'user',
  DRIVER = 'driver',
}

@Entity('ratings')
@Unique(['orderId', 'raterId']) 
@Index(['orderId'])
@Index(['ratedUserId'])
@Index(['raterId'])
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column({ type: 'uuid', nullable: false })
  orderId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'raterId' })
  rater: User; 

  @Column({ type: 'uuid', nullable: false })
  raterId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ratedUserId' })
  ratedUser: User; 

  @Column({ type: 'uuid', nullable: false })
  ratedUserId: string;

  @Column({
    type: 'decimal',
    precision: 3,
    scale: 2,
    nullable: false,
  })
  rating: number; 

  @Column({ type: 'text', nullable: true })
  comment: string;

  @Column({
    type: 'enum',
    enum: RatedUserRole,
    nullable: false,
  })
  ratedUserRole: RatedUserRole; 

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
