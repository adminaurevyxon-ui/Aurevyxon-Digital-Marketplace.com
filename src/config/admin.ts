/**
 * Master Single Source of Truth for Authorized Administrator Credentials
 * All comparisons are strictly case-normalized and whitespace-trimmed.
 */

export const ALLOWED_ADMIN_EMAILS: readonly string[] = Object.freeze([
  "jagannathsing777@gmail.com",
  "admin.aurevyxon@gmail.com",
  "admin@aurevyxon.com"
].map(email => email.trim().toLowerCase()));

/**
 * Safely normalize an email string for secure comparisons.
 */
export function normalizeEmail(email?: string | null): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Checks whether an email matches an authorized administrator.
 */
export function isAllowedAdminEmail(email?: string | null): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return ALLOWED_ADMIN_EMAILS.includes(normalized);
}

/**
 * Checks whether a user object has admin rights via strict allowlisted email.
 * This guarantees regular users cannot access admin features regardless of client-side role tamper.
 */
export function isAllowedAdminUser(user?: { role?: string | null; email?: string | null } | null): boolean {
  if (!user) return false;
  return isAllowedAdminEmail(user.email);
}

/**
 * Master Single Source of Truth for Authorized Active Sellers
 * Strict gate:
 * - User must exist and not be banned/suspended/deleted
 * - If Admin -> true
 * - Else User role must be 'seller'
 * - Seller profile KYC status must be 'verified' or 'approved'
 * - Seller profile status must not be 'SUSPENDED', 'BANNED', 'DELETED', or 'RESTRICTED'
 */
export function isAllowedSellerUser(user?: any): boolean {
  if (!user) return false;
  if (user.is_banned || user.is_suspended || user.status === 'SUSPENDED' || user.status === 'BANNED' || user.status === 'DELETED') {
    return false;
  }
  if (user.role === 'admin' || user.role === 'superadmin' || isAllowedAdminUser(user)) {
    return true;
  }
  const sellerProfile = user.seller_profile;
  const kycStatus = String(sellerProfile?.kyc_status || user.kyc_status || '').toLowerCase();
  const sellerStatus = String(sellerProfile?.status || user.seller_status || 'ACTIVE').toUpperCase();

  if (sellerStatus === 'SUSPENDED' || sellerStatus === 'BANNED' || sellerStatus === 'DELETED' || sellerStatus === 'RESTRICTED') {
    return false;
  }

  const isKycApproved = kycStatus === 'verified' || kycStatus === 'approved';
  return isKycApproved && user.role === 'seller';
}
