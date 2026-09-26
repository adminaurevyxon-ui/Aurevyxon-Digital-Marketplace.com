import { ReserveReleaseJob } from '../jobs/reserveRelease.ts';
import { PayoutBatchProcessor } from '../jobs/payoutBatch.ts';
import { ReconciliationEngine } from '../services/reconciliation.ts';
import { FraudRiskEngine } from '../services/fraudEngine.ts';
import { WebhookRetryEngine } from '../services/webhookRetry.ts';
import { AccountingReports } from '../services/reports.ts';
import db from '../db.ts';
import { ulid } from 'ulid';
import { LedgerEngine } from '../ledger.ts';

export async function runSmokeTests() {
  console.log('--- Starting Smoke Tests ---');

  const sellerId = 'smoke_test_seller_' + ulid();
  const reserveAccountId = `Reserve_Held_${sellerId}`;
  
  // 1. Reserve Release
  console.log('Testing Reserve Release...');
  await db.prepare(`
    INSERT INTO ledger_entries (id, transaction_id, account_id, entry_type, amount, currency, created_at)
    VALUES (?, ?, ?, 'credit', 500, 'INR', datetime('now', '-35 days'))
  `).run(ulid(), 'tx_smoke_1', reserveAccountId);
  
  await db.prepare(`
    INSERT INTO system_events (id, aggregate_id, event_type, payload, triggered_by)
    VALUES (?, ?, 'SaleCreated', ?, 'system')
  `).run(ulid(), 'sale_smoke_1', JSON.stringify({ transaction_id: 'tx_smoke_1' }));

  await ReserveReleaseJob.run(30);
  
  const balance = await LedgerEngine.getAccountBalance(`Seller_Payable_${sellerId}`);
  if (balance !== 500) throw new Error('Reserve release failed: Expected 500 payable balance.');

  // 2. Reconciliation Engine
  console.log('Testing Reconciliation Engine...');
  const report = [{ orderId: 'sale_smoke_1', grossAmount: 1000, commission: 200, sellerNet: 500 }];
  await ReconciliationEngine.run('razorpay', '2023-01-01', report);
  const runs = await ReconciliationEngine.getRuns();
  if (!Array.isArray(runs) || runs.length === 0) throw new Error('Reconciliation run not saved');

  // 3. Webhook Retry Engine
  console.log('Testing Webhook Retry Engine...');
  await WebhookRetryEngine.enqueue('razorpay', 'payment_failed', { id: 123 });
  let processCalled = false;
  await WebhookRetryEngine.processQueue(async () => { processCalled = true; });
  if (!processCalled) throw new Error('Webhook process queue failed');

  // 4. Fraud Risk Engine
  console.log('Testing Fraud Risk Engine...');
  const decision = await FraudRiskEngine.evaluateTransaction('sale_smoke_2', 'buyer_1', 'XX');
  if (!decision) throw new Error('Fraud evaluation failed');

  // 5. Payout Batch Processor
  console.log('Testing Payout Batch...');
  await PayoutBatchProcessor.run();
  const newBalance = await LedgerEngine.getAccountBalance(`Seller_Payable_${sellerId}`);
  if (newBalance !== 0) throw new Error('Payout batch failed to clear payable balance');

  // 6. Accounting Reports
  console.log('Testing Accounting Reports...');
  const pl = await AccountingReports.generatePLReport('2000-01-01', '2100-01-01');
  if (typeof pl.net_profit !== 'number') throw new Error('Accounting PL report failed');

  console.log('--- Smoke Tests Passed ---');
}
runSmokeTests().catch(console.error);
