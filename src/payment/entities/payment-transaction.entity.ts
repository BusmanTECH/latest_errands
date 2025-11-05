
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum PaymentTransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

export enum PaymentTransactionStatus {
  INITIATED = 'INITIATED',
  PENDING = 'PENDING',
  SUCCESSFUL = 'SUCCESSFUL',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

@Entity('payment_transactions')
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  user?: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'driverId' })
  driver?: User;

  @Column({ type: 'varchar', nullable: true })
  orderId?: string;

  @Column({ type: 'text', nullable: true })
  narration?: string;

  @Column({
    type: 'enum',
    enum: PaymentTransactionType,
    default: PaymentTransactionType.CREDIT,
  })
  type: PaymentTransactionType;

  @Column({
    type: 'enum',
    enum: PaymentTransactionStatus,
    default: PaymentTransactionStatus.INITIATED,
  })
  status: PaymentTransactionStatus;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: false,
  })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN', nullable: false })
  currency: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  reference?: string;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  constructor(transaction: Partial<PaymentTransaction>) {
    Object.assign(this, transaction);
  }
}

