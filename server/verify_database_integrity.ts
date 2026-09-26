import { firestore } from './db.ts';

async function verify() {
  console.log("🔍 [Starting Comprehensive Data Verification]");

  const collections = ['users', 'seller_profiles', 'listings', 'products', 'orders', 'transactions', 'kyc_documents', 'notifications', 'direct_messages'];

  for (const col of collections) {
    const snap = await firestore.collection(col).get();
    console.log(`\n📁 Collection: ${col} (${snap.docs.length} records)`);
    snap.docs.forEach(d => {
      const data = d.data();
      if (col === 'users') {
        console.log(`  - ID: ${d.id} | Email: ${data.email} | Name: ${data.name} | Role: ${data.role}`);
      } else if (col === 'seller_profiles') {
        console.log(`  - ID: ${d.id} | UserID: ${data.user_id} | Email: ${data.user_email || data.email} | Name: ${data.display_name} | KYC: ${data.kyc_status} | Status: ${data.status}`);
      } else if (col === 'listings' || col === 'products') {
        console.log(`  - ID: ${d.id} | Title: ${data.title} | Price: $${data.price} | Seller: ${data.seller_name}`);
      } else if (col === 'orders' || col === 'transactions') {
        console.log(`  - ID: ${d.id} | Amount: $${data.amount} | Status: ${data.status}`);
      } else if (col === 'kyc_documents') {
        console.log(`  - ID: ${d.id} | UserID: ${data.user_id} | Type: ${data.doc_type} | Slot: ${data.doc_slot}`);
      } else {
        console.log(`  - ID: ${d.id}`);
      }
    });
  }

  console.log("\n✅ [Verification Completed]");
}

verify().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
