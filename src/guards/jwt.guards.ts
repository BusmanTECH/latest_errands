
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService, private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing');
    }

    const token = authHeader.split(' ')[1]; 
    console.log(token,900)
    if (!token) {
      throw new UnauthorizedException('JWT token not found');
    }

    try {
      const decoded = this.jwtService.verify(token, {
        secret: this.configService.get<string>('ACCESS_TOKEN')
      });
      request.user = decoded; 
      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}