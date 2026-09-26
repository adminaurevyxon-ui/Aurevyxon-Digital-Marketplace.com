import { initFirestoreDefaults, deduplicateAndReconcileDatabase, firestore } from './db.ts';

async function cleanupExact() {
  console.log("🧹 [Strict General Deduplication & Sanitation Pass]");

  // 1. Hydrate defaults
  await initFirestoreDefaults();

  // 2. Run deterministic database deduplication and foreign-key reconciliation
  const result = await deduplicateAndReconcileDatabase();
  console.log("📊 Deduplication Result:", result);

  console.log("✨ [Strict Sanitation & Re-pointing Completed]");
}

cleanupExact().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});

