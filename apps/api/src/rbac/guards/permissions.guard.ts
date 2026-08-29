import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permission.decorator';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '../../common/decorators/allow-pending-password-change.decorator';
import { RbacService } from '../rbac.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Per docs/IMPLEMENTATION_PLAN.md §8: every route must carry an explicit
    // @RequirePermission(...) or @Public() marker. No marker = fail closed,
    // not "forgot to guard it".
    if (!required) {
      throw new ForbiddenException('Route is missing a @RequirePermission or @Public marker.');
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException();
    }

    // A still-valid access token must stop authorizing the moment the
    // account is deactivated — login/refresh already check this, but an
    // access token otherwise keeps working until it naturally expires.
    const isActive = await this.rbac.isUserActive(user.id);
    if (!isActive) {
      throw new UnauthorizedException();
    }

    // A user with mustChangePassword: true was previously only blocked
    // client-side (RequireAuth.tsx redirecting to /change-password) — a
    // valid access token could call any other endpoint directly. Fail
    // closed here too, exempting only the handful of routes a user in
    // that state genuinely needs (change-password itself, logout, and
    // /auth/me so the frontend can even render the change-password screen).
    const allowPending = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowPending) {
      const mustChangePassword = await this.rbac.mustChangePassword(user.id);
      if (mustChangePassword) {
        throw new ForbiddenException('Password change is required before this action.');
      }
    }

    if (required.length === 0) {
      return true; // authenticated only, no specific permission required
    }

    const userPermissions = await this.rbac.getPermissionsForUser(user.id);
    return required.every((permission) => userPermissions.has(permission));
  }
}
