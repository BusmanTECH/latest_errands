

import { JwtService } from '@nestjs/jwt';
import { Injectable, UnauthorizedException } from '@nestjs/common';

export type SocketUser = { sub: string; email: string; role: 'ADMIN'|'CUSTOMER'|'RIDER' };

@Injectable()
export class SocketAuth {
  constructor(private jwt: JwtService) {}

  verify(token?: string): SocketUser {
    if (!token) throw new UnauthorizedException('Missing token');
    try {
      
      return this.jwt.verify<SocketUser>(token, { secret: process.env.ACCESS_TOKEN });
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
