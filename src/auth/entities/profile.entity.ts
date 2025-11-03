/* eslint-disable prettier/prettier */
import { Entity, JoinColumn, OneToOne } from 'typeorm';
import { AbstractFileEntity } from './abstract.entity';
import { User } from './user.entity';

@Entity()
export class ProfileImage extends AbstractFileEntity<ProfileImage> {
  @OneToOne(() => User, (user) => user.profileImage, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  constructor(profileImage: Partial<ProfileImage>) {
    super(profileImage);
  }
}
