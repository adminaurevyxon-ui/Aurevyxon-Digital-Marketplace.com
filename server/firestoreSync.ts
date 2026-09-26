import db, { initFirestoreDefaults, firestore } from './db.ts';

export const firestoreDb = firestore;

export async function initServerFirestore() {
  try {
    await initFirestoreDefaults();
  } catch (err: any) {
    console.warn("⚠️ [Firestore Init Notice]:", err?.message || err);
  }
}

export async function syncProductToFirestore(product: any) {
  if (!product || !product.id) return;
  try {
    const pId = String(product.id);
    await db.set('products', pId, product);
  } catch (err: any) {
    console.error("[FirestoreSync] Product sync error:", err?.message || err);
  }
}

export async function syncUserToFirestore(user: any) {
  if (!user || !user.id) return;
  try {
    const uId = String(user.id);
    await db.set('users', uId, user);
  } catch (err: any) {
    console.error("[FirestoreSync] User sync error:", err?.message || err);
  }
}

export async function syncSellerProfileToFirestore(seller: any) {
  if (!seller || (!seller.user_id && !seller.id)) return;
  try {
    const sId = String(seller.user_id || seller.id);
    await db.set('sellers', sId, seller);
  } catch (err: any) {
    console.error("[FirestoreSync] Seller profile sync error:", err?.message || err);
  }
}

export async function syncOrderToFirestore(order: any) {
  if (!order || !order.id) return;
  try {
    const oId = String(order.id);
    await db.set('orders', oId, order);
  } catch (err: any) {
    console.error("[FirestoreSync] Order sync error:", err?.message || err);
  }
}

export async function syncMessageToFirestore(msg: any) {
  if (!msg || !msg.id) return;
  try {
    await db.set('direct_messages', String(msg.id), msg);
  } catch (err: any) {
    console.error("[FirestoreSync] Message sync error:", err?.message || err);
  }
}

export async function syncKycToFirestore(kyc: any) {
  if (!kyc || !kyc.id) return;
  try {
    await db.set('user_kyc', String(kyc.id), kyc);
  } catch (err: any) {
    console.error("[FirestoreSync] KYC sync error:", err?.message || err);
  }
}

export async function syncWalletTxToFirestore(tx: any) {
  if (!tx || !tx.id) return;
  try {
    await db.set('wallet_transactions', String(tx.id), tx);
  } catch (err: any) {
    console.error("[FirestoreSync] Wallet transaction sync error:", err?.message || err);
  }
}

export async function syncPayoutRequestToFirestore(payout: any) {
  if (!payout || !payout.id) return;
  try {
    await db.set('payout_requests', String(payout.id), payout);
  } catch (err: any) {
    console.error("[FirestoreSync] Payout request sync error:", err?.message || err);
  }
}

export async function syncCouponToFirestore(coupon: any) {
  if (!coupon || !coupon.id) return;
  try {
    await db.set('coupons', String(coupon.id), coupon);
  } catch (err: any) {
    console.error("[FirestoreSync] Coupon sync error:", err?.message || err);
  }
}

export async function syncReviewToFirestore(review: any) {
  if (!review || !review.id) return;
  try {
    await db.set('reviews', String(review.id), review);
  } catch (err: any) {
    console.error("[FirestoreSync] Review sync error:", err?.message || err);
  }
}

export async function syncTicketToFirestore(ticket: any) {
  if (!ticket || !ticket.id) return;
  try {
    await db.set('support_tickets', String(ticket.id), ticket);
  } catch (err: any) {
    console.error("[FirestoreSync] Support ticket sync error:", err?.message || err);
  }
}

export async function syncNotificationToFirestore(notif: any) {
  if (!notif || !notif.id) return;
  try {
    await db.set('notifications', String(notif.id), notif);
  } catch (err: any) {
    console.error("[FirestoreSync] Notification sync error:", err?.message || err);
  }
}

export async function syncAuditLogToFirestore(log: any) {
  if (!log || !log.id) return;
  try {
    await db.set('audit_logs', String(log.id), log);
  } catch (err: any) {
    console.error("[FirestoreSync] Audit log sync error:", err?.message || err);
  }
}

export async function syncSystemSettingToFirestore(setting: any) {
  if (!setting || (!setting.id && !setting.key)) return;
  try {
    const key = String(setting.key || setting.id);
    await db.set('platform_settings', key, setting);
  } catch (err: any) {
    console.error("[FirestoreSync] Platform setting sync error:", err?.message || err);
  }
}

export async function syncKycReverificationToFirestore(req: any) {
  if (!req || !req.id) return;
  try {
    await db.set('kyc_reverification_requests', String(req.id), req);
  } catch (err: any) {
    console.error("[FirestoreSync] KYC reverification sync error:", err?.message || err);
  }
}

export async function syncWishlistToFirestore(w: any) {
  if (!w || !w.id) return;
  try {
    await db.set('wishlists', String(w.id), w);
  } catch (err: any) {
    console.error("[FirestoreSync] Wishlist sync error:", err?.message || err);
  }
}

export async function removeWishlistFromFirestore(id: string) {
  if (!id) return;
  try {
    await db.delete('wishlists', String(id));
  } catch (err: any) {
    console.error("[FirestoreSync] Wishlist remove error:", err?.message || err);
  }
}

export async function syncPayoutMethodToFirestore(method: any) {
  if (!method || !method.id) return;
  try {
    await db.set('payout_methods', String(method.id), method);
  } catch (err: any) {
    console.error("[FirestoreSync] Payout method sync error:", err?.message || err);
  }
}

