
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum DeviceType {
  IOS = 'ios',
  ANDROID = 'android',
}

@Entity('push_tokens')
@Unique(['userId', 'token'])
@Index(['userId'])
export class PushToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  token: string;

  @Column({
    type: 'enum',
    enum: DeviceType,
  })
  deviceType: DeviceType;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

