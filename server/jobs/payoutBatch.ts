import db from '../db.ts';
import { ulid } from 'ulid';
import { LedgerEngine, LedgerEntry } from '../ledger.ts';

export class PayoutBatchProcessor {
  /**
   * Run payout batch job to transfer payable balances directly in Firestore
   */
  static async run() {
    console.log(`Starting Payout Batch Processor...`);

    const ledgerEntries = await db.getAll('ledger_entries');
    const sellerBalancesMap = new Map<string, number>();

    for (const e of ledgerEntries) {
      if (e.account_id && e.account_id.startsWith('Seller_Payable_')) {
        const current = sellerBalancesMap.get(e.account_id) || 0;
        const amt = Number(e.amount || 0);
        if (e.entry_type === 'credit') {
          sellerBalancesMap.set(e.account_id, current + amt);
        } else if (e.entry_type === 'debit') {
          sellerBalancesMap.set(e.account_id, current - amt);
        }
      }
    }

    for (const [accountId, netBalance] of sellerBalancesMap.entries()) {
      if (netBalance < 100) {
        continue;
      }

      const sellerId = accountId.replace('Seller_Payable_', '');
      console.log(`Initiating payout of ${netBalance} for seller ${sellerId}`);

      try {
        const payoutTxId = ulid();
        const entries: LedgerEntry[] = [
          {
            transaction_id: payoutTxId,
            account_id: accountId,
            entry_type: 'debit',
            amount: netBalance,
            currency: 'INR'
          },
          {
            transaction_id: payoutTxId,
            account_id: 'Gateway_Clearing',
            entry_type: 'credit',
            amount: netBalance,
            currency: 'INR'
          }
        ];

        await LedgerEngine.recordTransaction(entries, 'system');

        const eventId = ulid();
        await db.set('system_events', eventId, {
          id: eventId,
          aggregate_id: sellerId,
          event_type: 'PayoutSettled',
          payload: JSON.stringify({
            payout_transaction_id: payoutTxId,
            amount: netBalance
          }),
          triggered_by: 'system',
          created_at: new Date().toISOString()
        });

        console.log(`Successfully settled payout for ${sellerId}`);

      } catch (err) {
        console.error(`Failed to process payout for ${sellerId}:`, err);
      }
    }

    console.log(`Payout Batch Processor completed.`);
  }
}
