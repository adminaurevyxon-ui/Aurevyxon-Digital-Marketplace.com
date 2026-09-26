import db from '../db.ts';
import { ulid } from 'ulid';
import { LedgerEngine, LedgerEntry } from '../ledger.ts';

export class ReserveReleaseJob {
  /**
   * Release reserve funds directly in Firestore
   */
  static async run(holdPeriodDays: number = 30) {
    console.log(`Starting Reserve Release Job (Hold Period: ${holdPeriodDays} days)...`);
    
    const cutoffDate = new Date(Date.now() - holdPeriodDays * 24 * 60 * 60 * 1000).toISOString();
    const ledgerEntries = await db.getAll('ledger_entries');
    const systemEvents = await db.getAll('system_events');

    const eligibleReserves = ledgerEntries.filter(l => 
      l.account_id && l.account_id.startsWith('Reserve_Held_') &&
      l.entry_type === 'credit' &&
      l.created_at <= cutoffDate
    );

    for (const reserve of eligibleReserves) {
      const alreadyReleased = systemEvents.some(se => 
        se.event_type === 'ReserveReleased' && 
        typeof se.payload === 'string' && se.payload.includes(reserve.transaction_id)
      );

      if (alreadyReleased) continue;

      const sellerId = reserve.account_id.replace('Reserve_Held_', '');
      const releaseTxId = ulid();

      const entries: LedgerEntry[] = [
        {
          transaction_id: releaseTxId,
          account_id: reserve.account_id,
          entry_type: 'debit',
          amount: Number(reserve.amount || 0),
          currency: reserve.currency || 'INR'
        },
        {
          transaction_id: releaseTxId,
          account_id: `Seller_Payable_${sellerId}`,
          entry_type: 'credit',
          amount: Number(reserve.amount || 0),
          currency: reserve.currency || 'INR'
        }
      ];

      try {
        await LedgerEngine.recordTransaction(entries, 'system');
        
        const eventId = ulid();
        await db.set('system_events', eventId, {
          id: eventId,
          aggregate_id: reserve.transaction_id,
          event_type: 'ReserveReleased',
          payload: JSON.stringify({ 
            original_transaction_id: reserve.transaction_id,
            release_transaction_id: releaseTxId,
            amount: reserve.amount 
          }),
          triggered_by: 'system_job',
          created_at: new Date().toISOString()
        });
        
        console.log(`Released ${reserve.amount} ${reserve.currency} for seller ${sellerId}`);
      } catch (err) {
        console.error(`Failed to release reserve ${reserve.transaction_id}:`, err);
      }
    }
    
    console.log(`Reserve Release Job completed.`);
  }
}
