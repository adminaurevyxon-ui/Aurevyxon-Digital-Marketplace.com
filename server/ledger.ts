import db from './db.ts';
import { ulid } from 'ulid';

export interface LedgerEntry {
  transaction_id: string;
  account_id: string;
  entry_type: 'debit' | 'credit';
  amount: number;
  currency: string;
}

export class LedgerEngine {
  /**
   * Records a double-entry transaction in the ledger directly into Firestore.
   * A valid transaction MUST have debits equal to credits.
   */
  static async recordTransaction(entries: LedgerEntry[], triggeredBy: string = 'system'): Promise<void> {
    const totalDebits = entries.filter(e => e.entry_type === 'debit').reduce((sum, e) => sum + e.amount, 0);
    const totalCredits = entries.filter(e => e.entry_type === 'credit').reduce((sum, e) => sum + e.amount, 0);

    // Core Principle: Debits MUST equal Credits
    if (Math.abs(totalDebits - totalCredits) > 0.0001) {
      throw new Error(`Ledger imbalance: Debits (${totalDebits}) != Credits (${totalCredits})`);
    }

    const transactionId = entries[0]?.transaction_id || ulid();

    for (const entry of entries) {
      const entryId = ulid();
      await db.set('ledger_entries', entryId, {
        id: entryId,
        transaction_id: entry.transaction_id,
        account_id: entry.account_id,
        entry_type: entry.entry_type,
        amount: entry.amount,
        currency: entry.currency || 'INR',
        created_at: new Date().toISOString()
      });
    }

    const eventId = ulid();
    await db.set('system_events', eventId, {
      id: eventId,
      aggregate_id: transactionId,
      event_type: 'LedgerTransactionRecorded',
      payload: JSON.stringify({ entries }),
      triggered_by: triggeredBy,
      created_at: new Date().toISOString()
    });
  }

  /**
   * Calculates the current balance of any ledger account directly from Firestore.
   */
  static async getAccountBalance(accountId: string): Promise<number> {
    const entries = await db.getAll('ledger_entries', [{ field: 'account_id', op: '==', value: accountId }]);
    
    let totalCredits = 0;
    let totalDebits = 0;

    for (const e of entries) {
      if (e.entry_type === 'credit') {
        totalCredits += Number(e.amount || 0);
      } else if (e.entry_type === 'debit') {
        totalDebits += Number(e.amount || 0);
      }
    }

    return totalCredits - totalDebits;
  }

  /**
   * Process a split payment at point of sale directly in Firestore.
   */
  static async processSplitPayment(
    saleId: string, 
    buyerId: string, 
    sellerId: string, 
    grossAmount: number, 
    commissionRate: number = 0.15,
    currency: string = 'INR'
  ): Promise<void> {
    const transactionId = ulid();
    const platformCommission = parseFloat((grossAmount * commissionRate).toFixed(2));
    
    // In India (Section 194-O), e-commerce operators must withhold 1% TDS on the GROSS amount
    const tdsRate = 0.01; 
    const tdsAmount = parseFloat((grossAmount * tdsRate).toFixed(2));
    
    const sellerNet = parseFloat((grossAmount - platformCommission - tdsAmount).toFixed(2));

    const entries: LedgerEntry[] = [
      {
        transaction_id: transactionId,
        account_id: 'Gateway_Clearing',
        entry_type: 'debit',
        amount: grossAmount,
        currency
      },
      {
        transaction_id: transactionId,
        account_id: 'Platform_Revenue',
        entry_type: 'credit',
        amount: platformCommission,
        currency
      },
      {
        transaction_id: transactionId,
        account_id: 'TDS_Payable',
        entry_type: 'credit',
        amount: tdsAmount,
        currency
      },
      {
        transaction_id: transactionId,
        account_id: `Seller_Payable_${sellerId}`,
        entry_type: 'credit',
        amount: sellerNet,
        currency
      }
    ];

    await this.recordTransaction(entries, buyerId);

    const eventId = ulid();
    await db.set('system_events', eventId, {
      id: eventId,
      aggregate_id: saleId,
      event_type: 'SaleCreated',
      payload: JSON.stringify({
        grossAmount,
        platformCommission,
        tdsAmount,
        sellerNet,
        currency
      }),
      triggered_by: buyerId,
      created_at: new Date().toISOString()
    });
  }
}
