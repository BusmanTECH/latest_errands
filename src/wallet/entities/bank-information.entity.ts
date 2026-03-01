import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('bank_information')
@Index(['userId'])
export class BankInformation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid', nullable: false, unique: true })
  userId: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  accountName: string;

  @Column({ type: 'varchar', length: 20, nullable: false })
  accountNumber: string;

  @Column({ type: 'varchar', length: 255, nullable: false })
  bankName: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  bankCode?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

