import db from '../db.ts';
import { ulid } from 'ulid';

export class FraudRiskEngine {

  static async calculateSellerRiskScore(sellerId: string) {
    let score = 10;
    const factors = [];

    const kyc = await db.get('user_kyc', sellerId) || (await db.getAll('user_kyc', [{ field: 'user_id', op: '==', value: sellerId }]))[0];
    if (!kyc || kyc.status !== 'verified') {
      score += 40;
      factors.push('KYC not fully verified');
    }

    const disputes = await db.getAll('disputes', [{ field: 'seller_id', op: '==', value: sellerId }]);
    if (disputes.length > 0) {
      score += (disputes.length * 15);
      factors.push(`Has ${disputes.length} historical disputes`);
    }

    score = Math.min(score, 100);
    return { score, factors };
  }

  static async calculateTransactionRiskScore(orderId: string, buyerId: string, buyerCountry: string) {
    let score = 5;
    const factors = [];

    const highRiskCountries = ['XX', 'YY'];
    if (highRiskCountries.includes(buyerCountry)) {
      score += 30;
      factors.push('High-risk buyer country');
    }

    const recentOrders = await db.getAll('orders', [{ field: 'buyer_id', op: '==', value: buyerId }]);
    if (recentOrders.length > 3) {
      score += 25;
      factors.push(`High purchase velocity: ${recentOrders.length} orders in 24h`);
    }

    score = Math.min(score, 100);
    return { score, factors };
  }

  static async evaluateTransaction(orderId: string, buyerId: string, buyerCountry: string) {
    const { score, factors } = await this.calculateTransactionRiskScore(orderId, buyerId, buyerCountry);
    
    let decision = 'AUTO_APPROVE';
    if (score > 75) decision = 'AUTO_REJECT';
    else if (score > 50) decision = 'HOLD';
    else if (score > 30) decision = 'MANUAL_REVIEW';

    const evalId = ulid();
    await db.set('fraud_evaluations', evalId, {
      id: evalId,
      target_type: 'TRANSACTION',
      target_id: orderId,
      risk_score: score,
      contributing_factors: JSON.stringify(factors),
      decision,
      created_at: new Date().toISOString()
    });

    const eventId = ulid();
    await db.set('system_events', eventId, {
      id: eventId,
      aggregate_id: orderId,
      event_type: 'FraudEvaluationCompleted',
      payload: JSON.stringify({ score, factors, decision }),
      triggered_by: 'system',
      created_at: new Date().toISOString()
    });

    return decision;
  }
}
