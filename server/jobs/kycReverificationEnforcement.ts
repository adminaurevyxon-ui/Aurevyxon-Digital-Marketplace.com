import db from '../db.ts';
import { ulid } from 'ulid';
import { syncSellerProfileToFirestore, syncUserToFirestore } from '../firestoreSync.ts';

export class KYCReverificationEnforcementJob {
  private static isRunning = false;

  /**
   * Run server-side automated compliance verification on all active KYC re-verification requests.
   * Completely independent of client-side clock. Server UTC timestamps are the sole authority.
   */
  static async run() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const now = new Date();
      const nowIso = now.toISOString();

      // Retrieve all active re-verification requests
      let activeRequests = await db.getAll('kyc_reverification_requests');
      if (!Array.isArray(activeRequests)) activeRequests = [];

      const pendingOrReview = activeRequests.filter((r: any) => 
        r && Number(r.is_active) === 1 && ['PENDING', 'SUBMITTED', 'UNDER_REVIEW'].includes(String(r.status).toUpperCase())
      );

      for (const req of pendingOrReview) {
        const deadlineIso = req.deadline_at;
        if (!deadlineIso) continue;

        const deadlineDate = new Date(deadlineIso);
        if (isNaN(deadlineDate.getTime())) continue;

        // If deadline has passed
        if (now.getTime() > deadlineDate.getTime()) {
          // If seller submitted before deadline, and it's under review, do NOT expire while admin reviews unless admin-configured
          if (['SUBMITTED', 'UNDER_REVIEW'].includes(String(req.status).toUpperCase())) {
            // Under review: seller met submission timeline
            continue;
          }

          // Check for optional Grace Period
          const graceEndsIso = req.grace_period_ends_at;
          const graceEndsDate = graceEndsIso ? new Date(graceEndsIso) : null;
          const isInGracePeriod = graceEndsDate && !isNaN(graceEndsDate.getTime()) && now.getTime() <= graceEndsDate.getTime();

          if (isInGracePeriod) {
            // Seller is in warning / grace period
            if (!req.grace_period_warned) {
              const hoursLeft = Math.max(0, Math.ceil((graceEndsDate!.getTime() - now.getTime()) / (1000 * 60 * 60)));
              const notifId = ulid();
              await db.set('notifications', notifId, {
                id: notifId,
                user_id: req.user_id || req.seller_id,
                type: 'kyc_warning',
                title: '⚠️ KYC Verification Grace Period Active',
                message: `Your initial KYC re-verification deadline has passed. You have entered a ${hoursLeft}h grace period before account action (${req.expiration_action || 'RESTRICT_FEATURES'}) is enforced. Please submit your verification immediately.`,
                is_read: 0,
                created_at: nowIso
              });

              await db.set('kyc_reverification_requests', req.id, {
                ...req,
                grace_period_warned: true,
                updated_at: nowIso
              });
              console.log(`[KYC Enforcement] Sent grace period warning to seller ${req.seller_id || req.user_id}`);
            }
            continue;
          }

          // Grace period passed or no grace period -> ENFORCE EXPIRATION ACTION
          const action = req.expiration_action || 'RESTRICT_FEATURES';
          const sellerId = req.seller_id || req.user_id;

          console.log(`[KYC Enforcement] Request ${req.id} for seller ${sellerId} EXPIRED at ${nowIso}. Executing action: ${action}`);

          // 1. Apply platform compliance action
          if (action === 'RESTRICT_FEATURES') {
            await db.update('seller_profiles', sellerId, {
              reverification_restricted: 1,
              reverification_restricted_at: nowIso,
              payout_verified: 0,
              compliance_flag: 'KYC_DEADLINE_EXPIRED'
            });
            // Also update by user_id if needed
            const sp = db.getSync('seller_profiles', sellerId);
            if (sp) syncSellerProfileToFirestore(sp).catch(() => {});
          } else if (action === 'SUSPEND_ACCOUNT' || action === 'BLOCK_ACCOUNT') {
            await db.update('seller_profiles', sellerId, {
              kyc_status: 'suspended',
              reverification_restricted: 1,
              payout_verified: 0,
              compliance_flag: 'SUSPENDED_MISSED_KYC_DEADLINE'
            });
            await db.update('users', sellerId, {
              is_verified: 0,
              status: 'suspended'
            });
            const u = db.getSync('users', sellerId);
            if (u) syncUserToFirestore(u).catch(() => {});
          } else if (action === 'DEACTIVATE_ACCOUNT') {
            await db.update('users', sellerId, {
              is_active: 0,
              status: 'deactivated'
            });
            await db.update('seller_profiles', sellerId, {
              kyc_status: 'deactivated',
              reverification_restricted: 1
            });
          } else if (action === 'WARNING_ONLY') {
            await db.update('seller_profiles', sellerId, {
              reverification_warning: 1,
              compliance_flag: 'KYC_DEADLINE_OVERDUE'
            });
          }

          // 2. Mark request as EXPIRED
          const updatedRequest = {
            ...req,
            status: 'EXPIRED',
            is_active: 0,
            expired_at: nowIso,
            action_executed: action,
            action_executed_at: nowIso,
            updated_at: nowIso
          };
          await db.set('kyc_reverification_requests', req.id, updatedRequest);

          // 3. Create In-App Notification for seller
          const notifId = ulid();
          let notifMsg = `Your KYC re-verification deadline (${new Date(deadlineIso).toLocaleString()}) has expired. `;
          if (action === 'RESTRICT_FEATURES') {
            notifMsg += "As per platform compliance policy, store product creation and payout withdrawals have been restricted until you complete verification.";
          } else if (action === 'SUSPEND_ACCOUNT' || action === 'BLOCK_ACCOUNT') {
            notifMsg += "Your seller privileges have been suspended. Please contact compliance to restore access.";
          } else if (action === 'DEACTIVATE_ACCOUNT') {
            notifMsg += "Your account has been deactivated due to non-compliance with identity verification policies.";
          } else {
            notifMsg += "Please submit your required identity verification immediately to prevent account restrictions.";
          }

          await db.set('notifications', notifId, {
            id: notifId,
            user_id: sellerId,
            type: 'kyc_expired',
            title: '🚫 KYC Verification Deadline Expired',
            message: notifMsg,
            is_read: 0,
            created_at: nowIso
          });

          // 4. Log system event
          const eventId = ulid();
          await db.set('system_events', eventId, {
            id: eventId,
            aggregate_id: req.id,
            event_type: 'KYC_REVERIFICATION_EXPIRED_ENFORCED',
            payload: JSON.stringify({
              request_id: req.id,
              seller_id: sellerId,
              deadline_at: deadlineIso,
              expired_at: nowIso,
              action_executed: action,
              reason: req.reason
            }),
            triggered_by: 'system_compliance_worker',
            created_at: nowIso
          });
        }
      }
    } catch (err) {
      console.error('[KYC Enforcement Job] Error during automated compliance run:', err);
    } finally {
      this.isRunning = false;
    }
  }
}
