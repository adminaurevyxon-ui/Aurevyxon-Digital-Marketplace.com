import { Router } from 'express';
import db from '../db.ts';
import { LedgerEngine } from '../ledger.ts';
import { ulid } from 'ulid';

const router = Router();

router.use((req, res, next) => {
  next();
});

router.get('/gmv', async (req, res) => {
  try {
    const entries = await db.getAll('ledger_entries', [
      { field: 'account_id', op: '==', value: 'Gateway_Clearing' },
      { field: 'entry_type', op: '==', value: 'debit' }
    ]);
    const gmv = entries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    res.json({ gmv });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/revenue', async (req, res) => {
  try {
    const entries = await db.getAll('ledger_entries', [
      { field: 'account_id', op: '==', value: 'Platform_Revenue' },
      { field: 'entry_type', op: '==', value: 'credit' }
    ]);
    const revenue = entries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    res.json({ revenue });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ledger-explorer', async (req, res) => {
  try {
    const limitVal = parseInt(req.query.limit as string) || 100;
    const entries = await db.getAll('ledger_entries', [], 'created_at', 'desc', limitVal);
    res.json(entries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/seller/:id/balance', async (req, res) => {
  try {
    const sellerId = req.params.id;
    const payable = await LedgerEngine.getAccountBalance(`Seller_Payable_${sellerId}`);
    const reserve = await LedgerEngine.getAccountBalance(`Reserve_Held_${sellerId}`);
    
    res.json({
      sellerId,
      payable,
      reserve_held: reserve
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/reconciliation', async (req, res) => {
  try {
    const runs = await db.getAll('reconciliation_runs', [], 'created_at', 'desc');
    res.json(runs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reconciliation/:id/resolve', async (req, res) => {
  try {
    const { notes } = req.body;
    if (!notes) return res.status(400).json({ error: 'Notes required' });

    await db.update('reconciliation_runs', req.params.id, {
      status: 'RESOLVED',
      resolved_at: new Date().toISOString(),
      resolved_by: 'admin'
    });

    const eventId = ulid();
    await db.set('system_events', eventId, {
      id: eventId,
      aggregate_id: req.params.id,
      event_type: 'ReconciliationResolved',
      payload: JSON.stringify({ notes }),
      triggered_by: 'admin',
      created_at: new Date().toISOString()
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/webhook-dead-letter', async (req, res) => {
  try {
    const deadLetters = await db.getAll('webhook_dead_letter', [{ field: 'status', op: '==', value: 'DEAD_LETTER' }]);
    res.json(deadLetters);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
