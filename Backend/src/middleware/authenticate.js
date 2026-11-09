import { UserModel } from '../models/User.js';
import { readAccessToken } from '../security.js';
import { hasPermission, requirePermission } from '../permissions.js';

export function createAuthenticate(secret) {
  return async (req, res, next) => {
    const authorization = req.get('authorization') || '';
    const [scheme, token] = authorization.split(' ');
    const claims = scheme === 'Bearer' && token ? readAccessToken(token, secret) : null;
    if (!claims) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    try {
      const user = await UserModel.findById(claims.sub).select('-passwordHash');
      if (!user || !user.active) {
        return res.status(401).json({ error: 'Account is inactive or no longer exists.' });
      }
      if ((claims.ver ?? 0) !== user.tokenVersion) {
        return res.status(401).json({ error: 'Session expired. Please log in again.' });
      }
      if (user.isEmailVerified === false) {
        return res.status(403).json({ error: 'Email verification is required to access this account.' });
      }
      req.user = user;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requireAdmin(req, res, next) {
  if (!['admin', 'business_owner'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Business owner access required.' });
  }
  return next();
}

export const requireUserManagement = requirePermission('manage_users');

export async function requireUserOrEmployeeManagement(req, res, next) {
  try {
    if (
      await hasPermission(req.user, 'manage_users') ||
      await hasPermission(req.user, 'manage_employees')
    ) {
      return next();
    }
    return res.status(403).json({ error: 'You do not have permission to manage users or employees.' });
  } catch (error) {
    return next(error);
  }
}
