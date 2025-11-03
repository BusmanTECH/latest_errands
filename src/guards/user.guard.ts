import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class UserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    return Boolean(user && user.role === 'user');
  }
}
