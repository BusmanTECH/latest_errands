/* eslint-disable prettier/prettier */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const routePermissions = this.reflector.get<string[]>(
      PERMISSIONS_KEY,
      context.getHandler(),
    );

    if (!routePermissions || routePermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user || {};
    const userPermissions: string[] = Array.isArray(user.permissions)
      ? user.permissions
      : [];

    return routePermissions.every((p) => userPermissions.includes(p));
  }
}


