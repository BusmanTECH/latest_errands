import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('User not found in request');
    }

    if (!user.role || !['admin'].includes(user.role)) {
      throw new ForbiddenException(
        `Access denied. Invalid admin role: ${user.role || 'undefined'}`,
      );
    }

    return true;
  }
}
