
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('ACCESS_TOKEN'),
    });
  }

  async validate(payload: any): Promise<any> {
    const { sub } = payload || {};
    if (!sub) {
      throw new UnauthorizedException({
        status: 'error',
        message: 'Invalid token payload',
      });
    }

    const user = await this.userRepository.findOne({ where: { id: sub } });
    if (!user) {
      throw new UnauthorizedException({
        status: 'error',
        message: 'Invalid or expired token',
      });
    }

    return { id: user.id, sub: user.id, role: user.role };
  }
}
