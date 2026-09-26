import db from '../db.ts';
import { ulid } from 'ulid';

export class WebhookRetryEngine {
  
  static MAX_RETRIES = 5;

  /**
   * Enqueue a received webhook for async processing directly in Firestore
   */
  static async enqueue(gateway: string, eventType: string, payload: any) {
    const jobId = ulid();
    await db.set('webhook_dead_letter', jobId, {
      id: jobId,
      gateway,
      event_type: eventType,
      payload: JSON.stringify(payload),
      status: 'PENDING',
      retry_count: 0,
      created_at: new Date().toISOString()
    });
  }

  /**
   * Process pending webhooks from Firestore
   */
  static async processQueue(processorFn: (gateway: string, eventType: string, payload: any) => Promise<void>) {
    const pending = await db.getAll('webhook_dead_letter', [{ field: 'status', op: '==', value: 'PENDING' }]);

    for (const job of pending) {
      try {
        const payloadData = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
        await processorFn(job.gateway, job.event_type, payloadData);
        
        await db.update('webhook_dead_letter', job.id, { status: 'RESOLVED' });
        
        const eventId = ulid();
        await db.set('system_events', eventId, {
          id: eventId,
          aggregate_id: job.id,
          event_type: 'WebhookProcessedSuccessfully',
          payload: JSON.stringify({}),
          triggered_by: 'system',
          created_at: new Date().toISOString()
        });
        
      } catch (err: any) {
        const newRetryCount = (Number(job.retry_count) || 0) + 1;
        
        if (newRetryCount >= this.MAX_RETRIES) {
          await db.update('webhook_dead_letter', job.id, {
            retry_count: newRetryCount,
            error_message: err.message,
            status: 'DEAD_LETTER',
            next_retry_at: null
          });
        } else {
          const waitMins = Math.pow(newRetryCount, 2) * 5;
          const nextRetry = new Date(Date.now() + waitMins * 60000).toISOString();
          await db.update('webhook_dead_letter', job.id, {
            retry_count: newRetryCount,
            error_message: err.message,
            next_retry_at: nextRetry
          });
        }
      }
    }
  }

  static async resolveDeadLetter(id: string) {
    await db.update('webhook_dead_letter', id, { status: 'RESOLVED' });
    const eventId = ulid();
    await db.set('system_events', eventId, {
      id: eventId,
      aggregate_id: id,
      event_type: 'WebhookManuallyResolved',
      payload: JSON.stringify({}),
      triggered_by: 'admin',
      created_at: new Date().toISOString()
    });
  }
}
