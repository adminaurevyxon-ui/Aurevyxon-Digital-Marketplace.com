import db from '../db.ts';
import { ulid } from 'ulid';

export class ReconciliationEngine {
  /**
   * Run daily reconciliation against a gateway settlement report directly in Firestore
   */
  static async run(gateway: string, runDate: string, settlementReport: any[]) {
    console.log(`Starting Reconciliation for ${gateway} on ${runDate}`);
    let mismatches = 0;
    const details = [];

    const saleEvents = await db.getAll('system_events', [{ field: 'event_type', op: '==', value: 'SaleCreated' }]);

    for (const reportTx of settlementReport) {
      const saleEvent = saleEvents.find(e => e.aggregate_id === reportTx.orderId);

      if (!saleEvent) {
        mismatches++;
        details.push({ orderId: reportTx.orderId, error: 'Ledger record not found for gateway transaction' });
        continue;
      }

      let payload: any = {};
      try {
        payload = typeof saleEvent.payload === 'string' ? JSON.parse(saleEvent.payload) : saleEvent.payload;
      } catch (e) {
        payload = saleEvent.payload;
      }
      
      const grossMatch = Math.abs((payload.grossAmount || 0) - (reportTx.grossAmount || 0)) < 0.01;
      const commissionMatch = Math.abs((payload.platformCommission || 0) - (reportTx.commission || 0)) < 0.01;
      const netMatch = Math.abs((payload.sellerNet || 0) - (reportTx.sellerNet || 0)) < 0.01;

      if (!grossMatch || !commissionMatch || !netMatch) {
        mismatches++;
        details.push({
          orderId: reportTx.orderId,
          error: 'Amount mismatch',
          ledger: payload,
          gateway: reportTx
        });
      }
    }

    const status = mismatches > 0 ? 'MISMATCH_FOUND' : 'CLEAN';

    const runId = ulid();
    await db.set('reconciliation_runs', runId, {
      id: runId,
      gateway,
      run_date: runDate,
      status,
      details: JSON.stringify(details),
      created_at: new Date().toISOString()
    });

    console.log(`Reconciliation finished with status: ${status}. Mismatches: ${mismatches}`);
    return { status, mismatches, details };
  }

  static async getRuns() {
    return db.getAll('reconciliation_runs', [], 'created_at', 'desc');
  }

  static async resolveRun(runId: string, resolvedBy: string, notes: string) {
    const run = await db.get('reconciliation_runs', runId);
    if (!run) throw new Error("Run not found");
    
    await db.update('reconciliation_runs', runId, {
      status: 'RESOLVED',
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy
    });

    const eventId = ulid();
    await db.set('system_events', eventId, {
      id: eventId,
      aggregate_id: runId,
      event_type: 'ReconciliationResolved',
      payload: JSON.stringify({ notes }),
      triggered_by: resolvedBy,
      created_at: new Date().toISOString()
    });
  }
}
