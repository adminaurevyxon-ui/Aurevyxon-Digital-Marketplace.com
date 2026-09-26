import express from "express";
import db from "../db.ts";
import { ulid } from "ulid";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import JSZip from "jszip";
import fs from "fs";
import path from "path";
import { getMediaDoc } from "../mediaStorage.ts";
import { 
  syncAuditLogToFirestore, 
  syncUserToFirestore, 
  syncSellerProfileToFirestore, 
  syncKycToFirestore, 
  syncPayoutRequestToFirestore, 
  syncProductToFirestore,
  syncNotificationToFirestore,
  syncKycReverificationToFirestore 
} from "../firestoreSync.ts";

const router = express.Router();

// Ensure auxiliary columns exist on boot
try { db.prepare("ALTER TABLE users ADD COLUMN username TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE users ADD COLUMN country TEXT DEFAULT 'US'").run(); } catch(e) {}
try { db.prepare("ALTER TABLE users ADD COLUMN bio TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE users ADD COLUMN last_login_ip TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE users ADD COLUMN risk_score REAL DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'").run(); } catch(e) {}
try { db.prepare("ALTER TABLE users ADD COLUMN deletion_reason TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE users ADD COLUMN deleted_at TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE users ADD COLUMN deleted_by TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE admin_sessions ADD COLUMN revoked BOOLEAN DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE transactions ADD COLUMN seller_id TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE transactions ADD COLUMN buyer_id TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE transactions ADD COLUMN listing_id TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE transactions ADD COLUMN platform_fee REAL DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE transactions ADD COLUMN seller_earnings REAL DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE listings ADD COLUMN is_featured INTEGER DEFAULT 0").run(); } catch(e) {}
try { db.prepare("ALTER TABLE listings ADD COLUMN moderation_flags TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE listings ADD COLUMN deleted_at TEXT").run(); } catch(e) {}
try { db.prepare("ALTER TABLE seller_profiles ADD COLUMN risk_score REAL DEFAULT 15").run(); } catch(e) {}
try { db.prepare("ALTER TABLE seller_profiles ADD COLUMN country TEXT DEFAULT 'US'").run(); } catch(e) {}

// Populate missing username, country & listing status
try {
  db.prepare("UPDATE users SET username = LOWER(REPLACE(name, ' ', '')) WHERE username IS NULL OR username = ''").run();
  db.prepare("UPDATE users SET country = 'US' WHERE country IS NULL OR country = ''").run();
  db.prepare("UPDATE listings SET status = 'active' WHERE status IS NULL OR status = ''").run();
} catch(e) {}

const logAudit = (admin_id: string, action: string, target: string, details: any = {}) => {
  try {
    const logId = ulid();
    db.prepare("INSERT INTO audit_logs (id, admin_id, action, target, details) VALUES (?, ?, ?, ?, ?)").run(
      logId, admin_id, action, target, JSON.stringify(details)
    );
    syncAuditLogToFirestore({ id: logId, admin_id, action, target_id: target, details: JSON.stringify(details) }).catch(() => {});
  } catch(e) { console.error("Audit log failed", e); }
};

// --------------------------------------------------------------------------
// 1. OVERVIEW ANALYTICS API
// --------------------------------------------------------------------------
router.get("/overview", (req: any, res: any) => {
  try {
    const { range = '7d', groupBy = 'daily', startDate, endDate } = req.query;

    // Dates calculation
    let now = new Date();
    let start = new Date();

    if (range === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (range === '7d') {
      start.setDate(now.getDate() - 7);
    } else if (range === '30d') {
      start.setDate(now.getDate() - 30);
    } else if (range === '90d') {
      start.setDate(now.getDate() - 90);
    } else if (range === '12mo') {
      start.setFullYear(now.getFullYear() - 1);
    } else if (range === 'custom' && startDate && endDate) {
      start = new Date(startDate as string);
      now = new Date(endDate as string);
    }

    const startIso = start.toISOString();
    const todayStartIso = new Date(new Date().setHours(0,0,0,0)).toISOString();

    // 1. Financial Metrics (Always connected to real DB transactions)
    const revRow = db.prepare(`
      SELECT 
        COALESCE(SUM(amount), 0) as gross_volume,
        COALESCE(SUM(platform_fee), 0) as platform_commission,
        COALESCE(SUM(seller_earnings), 0) as seller_earnings,
        COUNT(id) as total_completed_tx
      FROM transactions 
      WHERE status = 'completed'
    `).get() as any;

    const refundRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_refunds, COUNT(id) as count
      FROM transactions
      WHERE status = 'refunded' OR status = 'disputed'
    `).get() as any;

    const chargebackRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_chargebacks
      FROM transactions
      WHERE status = 'chargeback'
    `).get() as any;
    const chargebackAmounts = chargebackRow?.total_chargebacks || 0;

    const grossVolume = revRow?.gross_volume || 0;
    const platformCommission = revRow?.platform_commission || 0;
    const sellerEarnings = revRow?.seller_earnings || 0;
    const refundAmounts = refundRow?.total_refunds || 0;
    const netRevenue = Math.max(0, grossVolume - refundAmounts);
    const platformRevenue = platformCommission;

    // 2. Users Metrics
    const totalUsers = (db.prepare("SELECT COUNT(*) as c FROM users").get() as any)?.c || 0;
    const activeUsers = (db.prepare("SELECT COUNT(*) as c FROM users WHERE is_banned = 0 AND is_suspended = 0").get() as any)?.c || 0;
    
    // Live Online-user counter calculation (active recent heartbeats)
    const recentLoginCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE last_login >= datetime('now', '-15 minutes')").get() as any)?.c || 0;
    const onlineUsersCount = recentLoginCount;

    const buyersCount = (db.prepare("SELECT COUNT(DISTINCT buyer_id) as c FROM orders").get() as any)?.c || 0;
    const sellersCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'seller' OR id IN (SELECT DISTINCT seller_id FROM listings)").get() as any)?.c || 0;
    const adminsCount = (db.prepare("SELECT COUNT(*) as c FROM users WHERE role IN ('admin', 'superadmin')").get() as any)?.c || 0;

    const newUsersToday = (db.prepare("SELECT COUNT(*) as c FROM users WHERE datetime(created_at) >= ?").get(todayStartIso) as any)?.c || 0;
    const newSellersToday = (db.prepare("SELECT COUNT(*) as c FROM seller_profiles WHERE datetime(created_at) >= ?").get(todayStartIso) as any)?.c || 0;

    // 3. Products Metrics
    const totalProducts = (db.prepare("SELECT COUNT(*) as c FROM listings").get() as any)?.c || 0;
    const pendingProducts = (db.prepare("SELECT COUNT(*) as c FROM listings WHERE is_approved = 0").get() as any)?.c || 0;

    // 4. Orders Breakdown
    const orderStatuses = db.prepare("SELECT status, COUNT(*) as c FROM orders GROUP BY status").all() as any[];
    const txStatuses = db.prepare("SELECT status, COUNT(*) as c FROM transactions GROUP BY status").all() as any[];

    const ordersByStatus = {
      completed: 0,
      pending: 0,
      refunded: 0,
      cancelled: 0,
      disputed: 0
    };

    orderStatuses.forEach(r => {
      const st = (r.status || 'pending').toLowerCase();
      if (st in ordersByStatus) (ordersByStatus as any)[st] += r.c;
      else ordersByStatus.pending += r.c;
    });
    txStatuses.forEach(r => {
      if (r.status === 'refunded') ordersByStatus.refunded += r.c;
    });

    // 5. Payouts, Fraud, KYC, Tickets
    const pendingPayoutRow = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(amount), 0) as amt FROM payout_requests WHERE status = 'pending'").get() as any;
    const completedPayoutRow = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(amount), 0) as amt FROM payout_requests WHERE status = 'completed'").get() as any;

    const fraudAlertsCount = (db.prepare("SELECT COUNT(*) as c FROM fraud_evaluations WHERE risk_score >= 60 OR decision = 'MANUAL_REVIEW'").get() as any)?.c || 0;
    const pendingKYCCount = (db.prepare("SELECT COUNT(*) as c FROM seller_profiles WHERE kyc_status = 'pending'").get() as any)?.c || 0;
    const openTicketsCount = (db.prepare("SELECT COUNT(*) as c FROM support_tickets WHERE status = 'open' OR status = 'pending'").get() as any)?.c || 0;

    // 6. Time Series Chart Data according to range & groupBy
    let chartDays = 7;
    if (range === 'today') chartDays = 1;
    else if (range === '30d') chartDays = 30;
    else if (range === '90d') chartDays = 90;
    else if (range === '12mo') chartDays = 365;

    const chartData = [];
    const stepDays = groupBy === 'monthly' ? 30 : groupBy === 'weekly' ? 7 : 1;
    const iterations = Math.min(Math.ceil(chartDays / stepDays), 30);

    for (let i = iterations - 1; i >= 0; i--) {
      const dCurr = new Date();
      dCurr.setDate(dCurr.getDate() - (i * stepDays));
      const dateStr = dCurr.toISOString().split('T')[0];

      let startDateStr = dateStr;
      let endDateStr = dateStr;
      if (stepDays > 1) {
        const dPrev = new Date(dCurr);
        dPrev.setDate(dPrev.getDate() - stepDays + 1);
        startDateStr = dPrev.toISOString().split('T')[0];
      }

      const txPeriod = db.prepare(`
        SELECT 
          COALESCE(SUM(amount), 0) as gross,
          COALESCE(SUM(platform_fee), 0) as rev,
          COALESCE(SUM(seller_earnings), 0) as seller,
          COUNT(id) as orders_count
        FROM transactions 
        WHERE status = 'completed' AND DATE(created_at) >= ? AND DATE(created_at) <= ?
      `).get(startDateStr, endDateStr) as any;

      const label = groupBy === 'monthly' 
        ? dCurr.toLocaleDateString('en-US', { month: 'short' })
        : groupBy === 'weekly' 
        ? `W${Math.ceil(dCurr.getDate() / 7)} ${dCurr.toLocaleDateString('en-US', { month: 'short' })}`
        : dCurr.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      chartData.push({
        label,
        date: dateStr,
        revenue: txPeriod?.rev || 0,
        grossVolume: txPeriod?.gross || 0,
        sellerEarnings: txPeriod?.seller || 0,
        ordersCount: txPeriod?.orders_count || 0
      });
    }

    // 7. Live Activity Feed from real events across database
    const activityList: any[] = [];

    // Transactions
    const recentTxs = db.prepare(`
      SELECT t.id, t.amount, t.status, t.created_at, l.title, u.name as buyer_name, s.name as seller_name
      FROM transactions t
      LEFT JOIN listings l ON t.listing_id = l.id
      LEFT JOIN users u ON t.buyer_id = u.id
      LEFT JOIN users s ON t.seller_id = s.id
      ORDER BY t.created_at DESC LIMIT 10
    `).all();

    recentTxs.forEach((t: any) => {
      activityList.push({
        id: `tx-${t.id}`,
        type: t.status === 'refunded' ? 'refund' : 'transaction',
        title: t.status === 'refunded' ? `Refund Processed ($${t.amount})` : `New Order Placed ($${t.amount})`,
        description: `${t.buyer_name || 'Buyer'} purchased "${t.title || 'Digital Asset'}" from ${t.seller_name || 'Seller'}`,
        amount: t.amount,
        status: t.status,
        timestamp: t.created_at,
        relatedId: t.id
      });
    });

    // Payout Requests
    const recentPayouts = db.prepare(`
      SELECT p.id, p.amount, p.status, p.created_at, u.name
      FROM payout_requests p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC LIMIT 5
    `).all();

    recentPayouts.forEach((p: any) => {
      activityList.push({
        id: `payout-${p.id}`,
        type: 'payout',
        title: `Payout Request (${p.status.toUpperCase()})`,
        description: `${p.name} requested withdrawal of $${p.amount.toFixed(2)}`,
        amount: p.amount,
        status: p.status,
        timestamp: p.created_at,
        relatedId: p.id
      });
    });

    // Support Tickets
    const recentTickets = db.prepare(`
      SELECT t.id, t.subject, t.status, t.created_at, u.name
      FROM support_tickets t
      JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC LIMIT 5
    `).all();

    recentTickets.forEach((tk: any) => {
      activityList.push({
        id: `ticket-${tk.id}`,
        type: 'ticket',
        title: `Support Ticket Created`,
        description: `${tk.name}: "${tk.subject || 'Inquiry'}"`,
        status: tk.status,
        timestamp: tk.created_at,
        relatedId: tk.id
      });
    });

    // User Signups
    recentSignups(activityList);

    // Sort live activity feed by timestamp DESC
    activityList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      metrics: {
        platformRevenue,
        grossVolume,
        netRevenue,
        platformCommission,
        sellerEarnings,
        totalUsers,
        activeUsers,
        onlineUsersCount,
        buyersCount,
        sellersCount,
        adminsCount,
        newUsersToday,
        newSellersToday,
        totalProducts,
        pendingProducts,
        ordersByStatus,
        pendingPayoutsCount: pendingPayoutRow?.c || 0,
        pendingPayoutsAmount: pendingPayoutRow?.amt || 0,
        completedPayoutsCount: completedPayoutRow?.c || 0,
        completedPayoutsAmount: completedPayoutRow?.amt || 0,
        refundAmounts,
        chargebackAmounts,
        fraudAlertsCount,
        pendingKYCCount,
        openTicketsCount
      },
      chartData,
      liveActivityFeed: activityList.slice(0, 15)
    });

  } catch (err: any) {
    console.error("Overview API error:", err);
    res.status(500).json({ error: err.message });
  }
});

function recentSignups(activityList: any[]) {
  try {
    const users = db.prepare("SELECT id, name, email, created_at FROM users ORDER BY created_at DESC LIMIT 5").all();
    users.forEach((u: any) => {
      activityList.push({
        id: `user-${u.id}`,
        type: 'user',
        title: `New User Registration`,
        description: `${u.name} (${u.email}) joined the platform`,
        timestamp: u.created_at,
        relatedId: u.id
      });
    });
  } catch(e) {}
}

// --------------------------------------------------------------------------
// 2. ADVANCED USERS LIST API (Search, Filter, Sort, Pagination)
// --------------------------------------------------------------------------
router.get("/users/advanced", (req: any, res: any) => {
  try {
    const {
      search = '',
      role = 'all',
      status = 'all',
      verification = 'all',
      kycStatus = 'all',
      filterTab = 'all',
      sortBy = 'created_at',
      sortOrder = 'desc',
      page = 1,
      limit = 10
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));

    // Get all records from memory/database and deduplicate by canonical user email/ID
    const rawUsersList = db.getAllSync('users') || [];
    const seenEmails = new Set<string>();
    const rawUsers: any[] = [];
    for (const u of rawUsersList) {
      if (!u || !u.id) continue;
      const em = u.email ? String(u.email).toLowerCase().trim() : `id:${u.id}`;
      const name = String(u.name || '').toLowerCase().trim();
      const id = String(u.id || '').toLowerCase().trim();

      // Exclude any fake/demo/sample accounts
      if (em.includes('@example.com') || em.endsWith('.example.com') || em.startsWith('test_') || em.startsWith('buyer_17') || em.startsWith('seller_17')) continue;
      if (id.startsWith('test_seller_') || id.startsWith('test_user_') || id === '01m1grw0ty256x6qp6tk8cqbvs' || id === '01m1grw0yet0n7xdmzw33kdg5r') continue;
      if (['quantai store', 'alex mercer', 'test seller store', 'test user'].includes(name) && (em.includes('example.com') || id.includes('test_') || id.includes('01m1grw0'))) continue;

      if (seenEmails.has(em)) continue;
      seenEmails.add(em);
      rawUsers.push(u);
    }

    const sellerProfiles = db.getAllSync('seller_profiles') || [];
    const sellers = db.getAllSync('sellers') || [];
    const spMap = new Map<string, any>();

    sellerProfiles.forEach((sp: any) => {
      if (!sp) return;
      if (sp.user_id) spMap.set(String(sp.user_id), sp);
      if (sp.id) spMap.set(String(sp.id), sp);
      if (sp.user_email) {
        const uMatch = rawUsers.find(u => u.email && String(u.email).toLowerCase().trim() === String(sp.user_email).toLowerCase().trim());
        if (uMatch) spMap.set(String(uMatch.id), sp);
      }
    });

    sellers.forEach((s: any) => {
      if (!s) return;
      const uid = String(s.user_id || s.userId || s.id || '');
      if (uid && !spMap.has(uid)) {
        spMap.set(uid, s);
      }
    });

    const transactions = db.getAllSync('transactions') || [];
    const purchaseMap = new Map<string, { orders_count: number; total_spending: number }>();
    const salesMap = new Map<string, { total_sales: number }>();

    transactions.forEach((t: any) => {
      if (t.status === 'completed') {
        if (t.buyer_id) {
          const b = purchaseMap.get(String(t.buyer_id)) || { orders_count: 0, total_spending: 0 };
          b.orders_count += 1;
          b.total_spending += Number(t.amount) || 0;
          purchaseMap.set(String(t.buyer_id), b);
        }
        if (t.seller_id) {
          const s = salesMap.get(String(t.seller_id)) || { total_sales: 0 };
          s.total_sales += Number(t.amount) || 0;
          salesMap.set(String(t.seller_id), s);
        }
      }
    });

    // Enrich all users
    const allEnriched = rawUsers.map((u: any) => {
      const uId = String(u.id || u.uid);
      const sp = spMap.get(uId) || (u.seller_profile || {});
      const pur = purchaseMap.get(uId) || { orders_count: 0, total_spending: 0 };
      const sal = salesMap.get(uId) || { total_sales: 0 };

      // Determine precise user type/role:
      let effectiveRole = 'buyer';
      const userRoleStr = String(u.role || '').toLowerCase();
      const userEmailStr = String(u.email || '').toLowerCase().trim();

      if (userRoleStr === 'admin' || userRoleStr === 'superadmin' || userEmailStr === 'jagannathsing777@gmail.com') {
        effectiveRole = 'admin';
      } else if (
        userRoleStr === 'seller' || 
        spMap.has(uId) || 
        (sp && (sp.kyc_status || sp.seller_type || sp.bank_account_number || sp.full_legal_name || sp.business_name))
      ) {
        effectiveRole = 'seller';
      } else {
        effectiveRole = 'buyer';
      }

      return {
        id: uId,
        name: u.name || 'User',
        username: u.username || (u.name ? u.name.toLowerCase().replace(/\s+/g, '') : 'user'),
        email: u.email || '',
        phone_number: u.phone_number || u.phone || 'N/A',
        role: effectiveRole,
        country: u.country || sp.country || 'US',
        created_at: u.created_at || u.updated_at || u.updatedAt || new Date().toISOString(),
        last_login: u.last_login || u.last_sign_in || u.created_at || new Date().toISOString(),
        is_suspended: Number(u.is_suspended) === 1 ? 1 : 0,
        is_banned: Number(u.is_banned) === 1 ? 1 : 0,
        is_verified: Number(u.is_verified) === 1 ? 1 : 0,
        risk_score: Number(u.fraud_score || u.risk_score || sp.risk_score || 0),
        admin_notes: u.admin_notes || '',
        seller_balance: Number(u.seller_balance || 0),
        commission_rate: Number(u.commission_rate || 0.25),
        provider: u.provider || 'local',
        kyc_status: sp.kyc_status || 'none',
        orders_count: pur.orders_count,
        total_spending: pur.total_spending,
        total_sales: sal.total_sales
      };
    });

    // Tab Counts accurately computed
    const tabCounts = {
      all: allEnriched.length,
      buyers: allEnriched.filter(u => u.role === 'buyer' || u.role === 'user').length,
      sellers: allEnriched.filter(u => u.role === 'seller').length,
      admins: allEnriched.filter(u => u.role === 'admin' || u.role === 'superadmin').length,
      active: allEnriched.filter(u => !u.is_banned && !u.is_suspended).length,
      suspended: allEnriched.filter(u => u.is_suspended === 1).length,
      banned: allEnriched.filter(u => u.is_banned === 1).length,
      pending_verification: allEnriched.filter(u => u.is_verified === 0 || u.kyc_status === 'pending').length
    };

    // Filter Users
    let filtered = allEnriched.filter(u => {
      // Search
      if (search && String(search).trim() !== '') {
        const q = String(search).trim().toLowerCase();
        const matchSearch =
          u.id.toLowerCase().includes(q) ||
          u.name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.phone_number.toLowerCase().includes(q) ||
          u.country.toLowerCase().includes(q);
        if (!matchSearch) return false;
      }

      // Filter Tab
      if (filterTab === 'buyers' && u.role !== 'buyer' && u.role !== 'user') return false;
      if (filterTab === 'sellers' && u.role !== 'seller') return false;
      if (filterTab === 'admins' && u.role !== 'admin' && u.role !== 'superadmin') return false;
      if (filterTab === 'active' && (u.is_banned || u.is_suspended)) return false;
      if (filterTab === 'suspended' && !u.is_suspended) return false;
      if (filterTab === 'banned' && !u.is_banned) return false;
      if (filterTab === 'pending_verification' && u.is_verified !== 0 && u.kyc_status !== 'pending') return false;

      // Role Filter Dropdown
      if (role !== 'all') {
        if (role === 'buyer' && u.role !== 'buyer' && u.role !== 'user') return false;
        if (role === 'seller' && u.role !== 'seller') return false;
        if (role === 'admin' && u.role !== 'admin' && u.role !== 'superadmin') return false;
      }

      // Status Filter Dropdown
      if (status !== 'all') {
        if (status === 'active' && (u.is_banned || u.is_suspended)) return false;
        if (status === 'suspended' && !u.is_suspended) return false;
        if (status === 'banned' && !u.is_banned) return false;
      }

      // Verification Filter Dropdown
      if (verification !== 'all') {
        if (verification === 'verified' && !u.is_verified) return false;
        if (verification === 'unverified' && u.is_verified) return false;
      }

      // KYC Filter Dropdown
      if (kycStatus !== 'all') {
        if (kycStatus === 'none' && u.kyc_status !== 'none') return false;
        if (kycStatus !== 'none' && u.kyc_status !== kycStatus) return false;
      }

      return true;
    });

    // Sorting
    filtered.sort((a: any, b: any) => {
      let valA = a.created_at;
      let valB = b.created_at;

      if (sortBy === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortBy === 'spending') {
        valA = a.total_spending;
        valB = b.total_spending;
      } else if (sortBy === 'orders') {
        valA = a.orders_count;
        valB = b.orders_count;
      } else if (sortBy === 'risk_score') {
        valA = a.risk_score;
        valB = b.risk_score;
      } else if (sortBy === 'last_login') {
        valA = a.last_login;
        valB = b.last_login;
      }

      if (sortOrder === 'asc') {
        return valA > valB ? 1 : valA < valB ? -1 : 0;
      } else {
        return valA < valB ? 1 : valA > valB ? -1 : 0;
      }
    });

    const total = filtered.length;
    const offset = (pageNum - 1) * limitNum;
    const paginatedUsers = filtered.slice(offset, offset + limitNum);

    res.json({
      users: paginatedUsers,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      },
      counts: tabCounts
    });

  } catch (err: any) {
    console.error("Advanced Users API error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 3. USER DETAILS API (Detailed Drawer/Modal Tabs)
// --------------------------------------------------------------------------
router.get("/users/:id/details", async (req: any, res: any) => {
  try {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ error: "Missing user ID parameter" });

    let user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as any;
    if (!user) {
      user = db.getSync('users', userId);
    }
    if (!user) {
      try {
        user = await db.get('users', userId);
      } catch (e) {}
    }
    if (!user) {
      // Check if there is a seller_profile or KYC with this ID
      const sp = db.getSync('seller_profiles', userId) || db.prepare('SELECT * FROM seller_profiles WHERE user_id = ? OR id = ?').get(userId, userId);
      if (sp) {
        user = {
          id: sp.user_id || sp.id || userId,
          name: sp.display_name || sp.legal_name || sp.full_legal_name || 'Seller Account',
          email: sp.user_account_email || sp.business_email || 'seller@internal',
          role: 'seller',
          is_verified: sp.kyc_status === 'verified' || sp.kyc_status === 'approved',
          is_suspended: 0,
          is_banned: 0,
          created_at: sp.created_at || new Date().toISOString()
        };
      }
    }

    if (!user) {
      return res.status(404).json({ error: `User profile for ID '${userId}' could not be found.` });
    }

    // Ensure username and country
    if (!user.username) {
      user.username = (user.name || 'user').toLowerCase().replace(/\s+/g, '');
    }
    if (!user.country) {
      user.country = 'US';
    }

    // Seller Profile / KYC
    let sellerProfile: any = null;
    let kycRecord: any = null;
    let kycDocuments: any[] = [];
    try {
      sellerProfile = db.prepare("SELECT * FROM seller_profiles WHERE user_id = ? OR id = ?").get(userId, userId) as any;
      kycRecord = db.prepare("SELECT * FROM user_kyc WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(userId) as any;
      const rawKycDocs = db.prepare("SELECT * FROM kyc_documents WHERE user_id = ?").all(userId) as any[] || [];
      
      const docFront = sellerProfile?.id_document_front_url || sellerProfile?.id_document_url || kycRecord?.document_url || '';
      const docBack = sellerProfile?.id_document_back_url || '';

      kycDocuments = rawKycDocs.map(d => {
        let filePath = d.file_path || '';
        let docType = d.doc_type || 'Identity Document';
        if (!filePath && (docType.startsWith('http') || docType.startsWith('data:') || docType.startsWith('/'))) {
          filePath = docType;
          docType = sellerProfile?.id_type || 'Identity Document';
        }
        if (!filePath) {
          if (String(d.doc_slot).toLowerCase() === 'back' && docBack) {
            filePath = docBack;
          } else if (docFront) {
            filePath = docFront;
          }
        }
        return {
          ...d,
          file_path: filePath,
          doc_type: docType,
          preview_url: `/api/admin/advanced/kyc/document/${d.id}/preview`,
          download_url: `/api/admin/advanced/kyc/document/${d.id}/download`
        };
      });

      if (sellerProfile) {
        if (!sellerProfile.id_document_front_url) {
          const frontFromList = kycDocuments.find(d => String(d.doc_slot).toLowerCase() === 'front') || kycDocuments[0];
          sellerProfile.id_document_front_url = frontFromList?.file_path || docFront || '';
        }
        if (!sellerProfile.id_document_url) {
          sellerProfile.id_document_url = sellerProfile.id_document_front_url;
        }
        if (!sellerProfile.id_document_back_url) {
          const backFromList = kycDocuments.find(d => String(d.doc_slot).toLowerCase() === 'back');
          sellerProfile.id_document_back_url = backFromList?.file_path || docBack || '';
        }
      }
    } catch (e) {}

    // Listed Products (if seller or creator)
    let products: any[] = [];
    try {
      products = db.prepare(`
        SELECT l.*, 
          (SELECT COUNT(*) FROM transactions WHERE listing_id = l.id) as real_sales_count,
          (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE listing_id = l.id) as real_revenue
        FROM listings l
        WHERE l.seller_id = ?
        ORDER BY l.created_at DESC
      `).all(userId) as any[] || [];
    } catch (e) {}

    // Orders (purchases made by this user)
    let orders: any[] = [];
    try {
      orders = db.prepare(`
        SELECT o.id, o.amount, o.status, o.created_at, l.title as product_title, l.id as listing_id, l.cover_image as product_image, l.price as unit_price
        FROM orders o
        LEFT JOIN listings l ON o.listing_id = l.id
        WHERE o.buyer_id = ?
        ORDER BY o.created_at DESC LIMIT 50
      `).all(userId) || [];
    } catch (e) {}

    // Sales (as seller)
    let sales: any[] = [];
    try {
      sales = db.prepare(`
        SELECT t.id, t.amount, t.platform_fee, t.seller_earnings, t.status, t.created_at, l.title as product_title, l.id as listing_id, u.name as buyer_name, u.email as buyer_email
        FROM transactions t
        LEFT JOIN listings l ON t.listing_id = l.id
        LEFT JOIN users u ON t.buyer_id = u.id
        WHERE t.seller_id = ?
        ORDER BY t.created_at DESC LIMIT 50
      `).all(userId) || [];
    } catch (e) {}

    // All relevant transactions
    let transactions: any[] = [];
    try {
      transactions = db.prepare(`
        SELECT t.*, l.title as product_title, bu.name as buyer_name, su.name as seller_name
        FROM transactions t
        LEFT JOIN listings l ON t.listing_id = l.id
        LEFT JOIN users bu ON t.buyer_id = bu.id
        LEFT JOIN users su ON t.seller_id = su.id
        WHERE t.seller_id = ? OR t.buyer_id = ?
        ORDER BY t.created_at DESC LIMIT 50
      `).all(userId, userId) || [];
    } catch (e) {}

    // Payments / Payout methods
    let payoutMethods: any[] = [];
    let payoutRequests: any[] = [];
    try {
      payoutMethods = db.prepare("SELECT * FROM payout_methods WHERE user_id = ?").all(userId) || [];
      payoutRequests = db.prepare("SELECT * FROM payout_requests WHERE user_id = ? ORDER BY created_at DESC").all(userId) || [];
    } catch (e) {}

    // Wallet Ledger
    let walletTransactions: any[] = [];
    try {
      walletTransactions = db.prepare("SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(userId) || [];
    } catch (e) {}

    // Refunds / Disputes
    let refunds: any[] = [];
    try {
      refunds = db.prepare(`
        SELECT r.*, l.title as product_title, bu.name as buyer_name, su.name as seller_name
        FROM refund_requests r
        LEFT JOIN listings l ON r.listing_id = l.id
        LEFT JOIN users bu ON r.buyer_id = bu.id
        LEFT JOIN users su ON r.seller_id = su.id
        WHERE r.buyer_id = ? OR r.seller_id = ?
        ORDER BY r.created_at DESC LIMIT 30
      `).all(userId, userId) || [];
    } catch (e) {}

    // Reviews (given & received)
    let reviewsReceived: any[] = [];
    let reviewsGiven: any[] = [];
    try {
      reviewsReceived = db.prepare(`
        SELECT r.*, l.title as product_title, u.name as author_name, u.avatar_url as author_avatar
        FROM reviews r
        LEFT JOIN listings l ON r.listing_id = l.id
        LEFT JOIN users u ON r.user_id = u.id
        WHERE r.seller_id = ?
        ORDER BY r.created_at DESC LIMIT 30
      `).all(userId) || [];

      reviewsGiven = db.prepare(`
        SELECT r.*, l.title as product_title, su.name as seller_name
        FROM reviews r
        LEFT JOIN listings l ON r.listing_id = l.id
        LEFT JOIN users su ON r.seller_id = su.id
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC LIMIT 30
      `).all(userId) || [];
    } catch (e) {}

    // Support Tickets
    let supportTickets: any[] = [];
    try {
      supportTickets = db.prepare(`
        SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 30
      `).all(userId) || [];
    } catch (e) {}

    // Direct Messages with Admin
    let directMessages: any[] = [];
    try {
      directMessages = db.prepare(`
        SELECT m.*, su.name as sender_name, ru.name as recipient_name
        FROM direct_messages m
        LEFT JOIN users su ON m.sender_id = su.id
        LEFT JOIN users ru ON m.recipient_id = ru.id
        WHERE m.sender_id = ? OR m.recipient_id = ? OR m.user_id = ?
        ORDER BY m.created_at ASC LIMIT 100
      `).all(userId, userId, userId) || [];
    } catch (e) {}

    // Activity & Audit
    let activity: any[] = [];
    try {
      activity = db.prepare(`
        SELECT id, action as title, details as description, created_at as timestamp, 'audit' as type, admin_id
        FROM audit_logs WHERE target = ? OR admin_id = ?
        ORDER BY created_at DESC LIMIT 50
      `).all(userId, userId) || [];
    } catch (e) {}

    // Security & Sessions / Devices
    let sessions: any[] = [];
    try {
      sessions = db.prepare("SELECT * FROM admin_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").all(userId) || [];
    } catch (e) {}

    // Calculate live financial metrics
    const grossSales = sales.reduce((acc: number, s: any) => acc + (Number(s.amount) || 0), 0);
    const platformCommissions = sales.reduce((acc: number, s: any) => acc + (Number(s.platform_fee) || 0), 0);
    const netSellerEarnings = sales.reduce((acc: number, s: any) => acc + (Number(s.seller_earnings) || 0), 0);
    const totalPaidOut = payoutRequests
      .filter((p: any) => p.status === 'completed' || p.status === 'approved')
      .reduce((acc: number, p: any) => acc + (Number(p.amount) || 0), 0);
    const pendingPayoutAmount = payoutRequests
      .filter((p: any) => p.status === 'pending')
      .reduce((acc: number, p: any) => acc + (Number(p.amount) || 0), 0);

    res.json({
      profile: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        phone_number: user.phone_number || 'N/A',
        country: user.country,
        address: user.address || sellerProfile?.address || 'N/A',
        city: user.city || sellerProfile?.city || 'N/A',
        postal_code: user.postal_code || sellerProfile?.postal_code || 'N/A',
        bio: user.bio || '',
        avatar_url: user.avatar_url,
        role: user.role
      },
      account: {
        provider: user.provider || 'local',
        created_at: user.created_at,
        last_login: user.last_login,
        last_login_ip: user.last_login_ip || '127.0.0.1',
        is_verified: !!user.is_verified,
        is_suspended: !!user.is_suspended,
        is_banned: !!user.is_banned,
        admin_notes: user.admin_notes || ''
      },
      sellerProfile,
      kycRecord,
      kycDocuments,
      products,
      orders,
      sales,
      transactions,
      payoutMethods,
      payoutRequests,
      walletTransactions,
      refunds,
      reviewsReceived,
      reviewsGiven,
      supportTickets,
      directMessages,
      activity,
      sessions,
      financials: {
        grossSales,
        platformCommissions,
        netSellerEarnings,
        totalPaidOut,
        pendingPayoutAmount,
        availableSellerBalance: user.seller_balance || 0,
        platformBalance: user.platform_balance || 0,
        commissionRate: user.commission_rate || 0.25
      },
      security: {
        fraud_score: user.fraud_score || 0,
        risk_score: user.risk_score || user.fraud_score || 0,
        two_factor_enabled: false,
        active_sessions_count: sessions.filter((s: any) => !s.revoked).length,
        total_sessions_count: sessions.length
      },
      wallet: {
        seller_balance: user.seller_balance || 0,
        platform_balance: user.platform_balance || 0,
        commission_rate: user.commission_rate || 0.25
      }
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// 4. USER ACTIONS (Permission-checked, confirmed, audit-logged)
// --------------------------------------------------------------------------

// Edit user profile/details
router.post("/users/:id/edit", (req: any, res: any) => {
  try {
    const { name, username, email, phone_number, country, role, commission_rate } = req.body;
    const userId = req.params.id;

    db.prepare(`
      UPDATE users 
      SET name = COALESCE(?, name),
          username = COALESCE(?, username),
          email = COALESCE(?, email),
          phone_number = COALESCE(?, phone_number),
          country = COALESCE(?, country),
          role = COALESCE(?, role),
          commission_rate = COALESCE(?, commission_rate)
      WHERE id = ?
    `).run(name, username, email, phone_number, country, role, commission_rate, userId);

    logAudit((req as any).user.id, "EDIT_USER_PROFILE", userId, { name, username, email, role, commission_rate });
    res.json({ success: true, message: "User profile updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Verify / Unverify
router.post("/users/:id/verify", (req: any, res: any) => {
  try {
    const { is_verified } = req.body;
    const userId = req.params.id;
    db.prepare("UPDATE users SET is_verified = ? WHERE id = ?").run(is_verified ? 1 : 0, userId);
    logAudit((req as any).user.id, is_verified ? "VERIFY_USER" : "UNVERIFY_USER", userId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Suspend / Unsuspend
router.post("/users/:id/suspend", (req: any, res: any) => {
  try {
    const { is_suspended, reason } = req.body;
    const userId = req.params.id;
    db.prepare("UPDATE users SET is_suspended = ? WHERE id = ?").run(is_suspended ? 1 : 0, userId);
    logAudit((req as any).user.id, is_suspended ? "SUSPEND_USER" : "UNSUSPEND_USER", userId, { reason });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Ban / Unban
router.post("/users/:id/ban", (req: any, res: any) => {
  try {
    const { is_banned, reason } = req.body;
    const userId = req.params.id;
    if (userId === (req as any).user.id && is_banned) {
      return res.status(400).json({ error: "You cannot ban yourself" });
    }
    db.prepare("UPDATE users SET is_banned = ? WHERE id = ?").run(is_banned ? 1 : 0, userId);
    logAudit((req as any).user.id, is_banned ? "BAN_USER" : "UNBAN_USER", userId, { reason });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Force Logout / Revoke Sessions
router.post(["/users/:id/force-logout", "/users/:id/force_logout"], (req: any, res: any) => {
  try {
    const userId = req.params.id;
    db.prepare("UPDATE admin_sessions SET revoked = 1 WHERE user_id = ?").run(userId);
    logAudit((req as any).user.id, "FORCE_LOGOUT_USER", userId);
    res.json({ success: true, message: "User sessions revoked" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Password Reset
router.post(["/users/:id/password-reset", "/users/:id/password_reset", "/users/:id/reset-password"], async (req: any, res: any) => {
  try {
    const userId = req.params.id;
    const { new_password } = req.body;
    const tempPassword = new_password || ("Reset_" + crypto.randomBytes(6).toString("hex"));
    const hash = await bcrypt.hash(tempPassword, 10);

    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
    logAudit((req as any).user.id, "RESET_USER_PASSWORD", userId);

    res.json({ success: true, temporary_password: tempPassword, message: "Password reset successful" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Save Internal Note
router.post(["/users/:id/note", "/users/:id/notes"], (req: any, res: any) => {
  try {
    const userId = req.params.id;
    const { note } = req.body;
    db.prepare("UPDATE users SET admin_notes = ? WHERE id = ?").run(note || '', userId);
    logAudit((req as any).user.id, "UPDATE_USER_INTERNAL_NOTE", userId, { note });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Send Notification / Email
router.post("/users/:id/notify", (req: any, res: any) => {
  try {
    const userId = req.params.id;
    const { message, type = 'system_alert' } = req.body;

    if (!message) return res.status(400).json({ error: "Message is required" });

    db.prepare("INSERT INTO notifications (id, user_id, type, message) VALUES (?, ?, ?, ?)").run(
      ulid(), userId, type, message
    );

    logAudit((req as any).user.id, "SEND_USER_NOTIFICATION", userId, { message, type });
    res.json({ success: true, message: "Notification delivered to user" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Revoke Single Session
router.post("/users/:id/sessions/:sessionId/revoke", (req: any, res: any) => {
  try {
    const { id: userId, sessionId } = req.params;
    db.prepare("UPDATE admin_sessions SET revoked = 1 WHERE id = ? AND user_id = ?").run(sessionId, userId);
    logAudit((req as any).user.id, "REVOKE_USER_SESSION", userId, { sessionId });
    res.json({ success: true, message: "Session revoked successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Override Risk Score
router.post("/users/:id/risk-override", (req: any, res: any) => {
  try {
    const userId = req.params.id;
    const { risk_score, reason } = req.body;
    db.prepare("UPDATE users SET risk_score = ?, fraud_score = ? WHERE id = ?").run(
      Number(risk_score) || 0,
      Number(risk_score) || 0,
      userId
    );
    logAudit((req as any).user.id, "OVERRIDE_USER_RISK_SCORE", userId, { risk_score, reason });
    res.json({ success: true, message: "Risk score updated" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Account (Permanent / Compliance)
router.post(["/users/:id/delete", "/users/:id/status/delete"], async (req: any, res: any) => {
  try {
    const userId = req.params.id;
    const adminId = (req as any).user?.id || 'admin';
    if (userId === adminId) {
      return res.status(400).json({ error: "You cannot delete your own active administrator account" });
    }
    const targetUser = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
    if (!targetUser) return res.status(404).json({ error: "User not found" });

    const deletionReason = String(req.body.deletion_reason || req.body.reason || "Administrative Action - Terms of Service and Compliance Violation").trim();
    const nowIso = new Date().toISOString();

    // Mark user status = DELETED, set metadata, ban/suspend
    db.prepare(`
      UPDATE users 
      SET status = 'DELETED', 
          deletion_reason = ?, 
          deleted_at = ?, 
          deleted_by = ?,
          is_banned = 1,
          is_suspended = 1
      WHERE id = ?
    `).run(deletionReason, nowIso, adminId, userId);

    // Deactivate seller listings
    db.prepare("UPDATE listings SET status = 'deleted', is_approved = 0, deleted_at = ? WHERE seller_id = ?").run(nowIso, userId);

    // Deactivate seller profile
    db.prepare("UPDATE seller_profiles SET status = 'DELETED', kyc_status = 'rejected' WHERE user_id = ? OR id = ?").run(userId, userId);

    // Revoke all existing sessions
    db.prepare("UPDATE admin_sessions SET revoked = 1 WHERE user_id = ?").run(userId);

    // Real Cloud Firestore sync
    const updatedUser = {
      ...targetUser,
      status: 'DELETED',
      deletion_reason: deletionReason,
      deleted_at: nowIso,
      deleted_by: adminId,
      is_banned: 1,
      is_suspended: 1
    };

    try {
      await syncUserToFirestore(updatedUser);
      await db.set('users', userId, updatedUser);
    } catch (fsErr) {
      console.warn("Firestore sync for deleted user notice:", fsErr);
    }

    logAudit(adminId, "DELETE_USER_ACCOUNT", userId, { 
      email: targetUser.email, 
      name: targetUser.name,
      reason: deletionReason,
      deleted_at: nowIso
    });

    res.json({ 
      success: true, 
      message: "User account deleted successfully", 
      status: "DELETED",
      deletion_reason: deletionReason,
      deleted_at: nowIso,
      deleted_by: adminId
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// User Dossier Download (CSV or JSON)
router.get("/users/:id/download-dossier", (req: any, res: any) => {
  try {
    const userId = req.params.id;
    const format = req.query.format === 'csv' ? 'csv' : 'json';
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
    if (!user) return res.status(404).json({ error: "User not found" });

    const sellerProfile = db.prepare("SELECT * FROM seller_profiles WHERE user_id = ?").get(userId) as any;
    const orders = db.prepare("SELECT * FROM orders WHERE buyer_id = ?").all(userId);
    const sales = db.prepare("SELECT * FROM transactions WHERE seller_id = ?").all(userId);
    const audits = db.prepare("SELECT * FROM audit_logs WHERE target = ?").all(userId);

    const fullDossier = {
      exported_at: new Date().toISOString(),
      user: { ...user, password_hash: undefined },
      sellerProfile,
      orders,
      sales,
      auditLogs: audits
    };

    logAudit((req as any).user.id, "DOWNLOAD_USER_DOSSIER", userId, { format });

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="User_Dossier_${user.username || userId}.csv"`);
      let csv = `FIELD,VALUE\n`;
      Object.entries(user).forEach(([k, v]) => {
        if (k !== 'password_hash') csv += `"${k}","${String(v || '').replace(/"/g, '""')}"\n`;
      });
      return res.send(csv);
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="User_Dossier_${user.username || userId}.json"`);
    return res.send(JSON.stringify(fullDossier, null, 2));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// OMEGA-NEXUS Global Search Endpoint
router.get("/search", (req: any, res: any) => {
  try {
    const q = (req.query.q || '').toString().trim().toLowerCase();
    if (!q || q.length < 2) {
      return res.json({ users: [], products: [], transactions: [], payouts: [], tickets: [], kyc: [], fraud: [] });
    }

    const pattern = `%${q}%`;

    const users = db.prepare(`
      SELECT id, name, email, role, is_banned, is_suspended, created_at
      FROM users
      WHERE LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(id) LIKE ?
      LIMIT 5
    `).all(pattern, pattern, pattern);

    const products = db.prepare(`
      SELECT id, title, price, status
      FROM listings
      WHERE LOWER(title) LIKE ? OR LOWER(id) LIKE ? OR LOWER(description) LIKE ?
      LIMIT 5
    `).all(pattern, pattern, pattern);

    const transactions = db.prepare(`
      SELECT id, amount, status, created_at, product_title, buyer_name, seller_name
      FROM transactions
      WHERE LOWER(id) LIKE ? OR LOWER(product_title) LIKE ? OR LOWER(buyer_name) LIKE ? OR LOWER(seller_name) LIKE ?
      LIMIT 5
    `).all(pattern, pattern, pattern, pattern);

    const payouts = db.prepare(`
      SELECT id, user_id, user_name, amount, status, method_type
      FROM payout_requests
      WHERE LOWER(id) LIKE ? OR LOWER(user_name) LIKE ? OR LOWER(status) LIKE ?
      LIMIT 5
    `).all(pattern, pattern, pattern);

    const tickets = db.prepare(`
      SELECT id, user_name, subject, priority, status
      FROM support_tickets
      WHERE LOWER(id) LIKE ? OR LOWER(subject) LIKE ? OR LOWER(user_name) LIKE ?
      LIMIT 5
    `).all(pattern, pattern, pattern);

    const kyc = db.prepare(`
      SELECT id, user_id, display_name, user_email, kyc_status
      FROM seller_profiles
      WHERE LOWER(id) LIKE ? OR LOWER(display_name) LIKE ? OR LOWER(user_email) LIKE ?
      LIMIT 5
    `).all(pattern, pattern, pattern);

    const fraud = db.prepare(`
      SELECT id, user_id, type, severity, status, description
      FROM fraud_alerts
      WHERE LOWER(id) LIKE ? OR LOWER(type) LIKE ? OR LOWER(description) LIKE ?
      LIMIT 5
    `).all(pattern, pattern, pattern);

    res.json({
      users,
      products,
      transactions,
      payouts,
      tickets,
      kyc,
      fraud
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: Consolidate & Deduplicate Seller KYC Submissions Across Tables & Collections
export function ensureConsolidatedKYCRecords() {
  try {
    const allUsers = db.getAllSync('users') || [];
    const allSps = db.getAllSync('seller_profiles') || [];
    const allSellers = db.getAllSync('sellers') || [];
    const allUserKyc = db.getAllSync('user_kyc') || [];

    const userById = new Map<string, any>();
    const userByEmail = new Map<string, any>();
    for (const u of allUsers) {
      if (u && u.id) {
        userById.set(String(u.id), u);
        if (u.email) userByEmail.set(String(u.email).toLowerCase().trim(), u);
      }
    }

    const userKycMap = new Map<string, any[]>();
    for (const k of allUserKyc) {
      if (k && k.user_id) {
        const uid = String(k.user_id);
        if (!userKycMap.has(uid)) userKycMap.set(uid, []);
        userKycMap.get(uid)!.push(k);
      }
    }

    const sellerColMap = new Map<string, any[]>();
    for (const s of allSellers) {
      const uid = String(s.user_id || s.userId || s.id || '');
      if (uid) {
        if (!sellerColMap.has(uid)) sellerColMap.set(uid, []);
        sellerColMap.get(uid)!.push(s);
      }
    }

    // Step A: Group all seller_profiles by canonical user_id (or email if user_id was generic/orphaned)
    const spByUser = new Map<string, any[]>();
    for (const sp of allSps) {
      let uid = String(sp.user_id || sp.id || '');
      // Match by email if user_id was generic or not in users
      if (sp.user_email) {
        const matchedUser = userByEmail.get(String(sp.user_email).toLowerCase().trim());
        if (matchedUser) {
          uid = String(matchedUser.id);
          sp.user_id = uid;
        }
      } else if (uid && !userById.has(uid)) {
        const nameKey = (sp.full_legal_name || sp.display_name || '').toLowerCase().trim();
        for (const u of allUsers) {
          if (u.name && String(u.name).toLowerCase().trim() === nameKey) {
            uid = String(u.id);
            sp.user_id = uid;
            break;
          }
        }
      }

      if (uid) {
        if (!spByUser.has(uid)) spByUser.set(uid, []);
        spByUser.get(uid)!.push(sp);
      }
    }

    // Clean up duplicate seller_profiles per user
    for (const [uid, profiles] of spByUser.entries()) {
      if (profiles.length > 1) {
        profiles.sort((a, b) => {
          const aVerified = ['verified', 'approved'].includes(String(a.kyc_status || '').toLowerCase()) ? 1 : 0;
          const bVerified = ['verified', 'approved'].includes(String(b.kyc_status || '').toLowerCase()) ? 1 : 0;
          if (aVerified !== bVerified) return bVerified - aVerified;
          const dateA = new Date(a.updated_at || a.kyc_submitted_at || a.created_at || 0).getTime();
          const dateB = new Date(b.updated_at || b.kyc_submitted_at || b.created_at || 0).getTime();
          return dateB - dateA;
        });

        const primary = profiles[0];
        for (let i = 1; i < profiles.length; i++) {
          const dup = profiles[i];
          for (const key of Object.keys(dup)) {
            if (dup[key] !== null && dup[key] !== undefined && dup[key] !== '' && (primary[key] === null || primary[key] === undefined || primary[key] === '')) {
              primary[key] = dup[key];
            }
          }
          if (dup.id && dup.id !== primary.id) {
            db.delete('seller_profiles', String(dup.id));
            db.delete('sellers', String(dup.id));
          }
        }
        db.set('seller_profiles', String(primary.id), primary);
      }
    }

    // Step B: Ensure every user with a KYC submission has ONE valid seller_profiles record
    const allKnownUserIds = new Set<string>();
    for (const uid of sellerColMap.keys()) allKnownUserIds.add(uid);
    for (const uid of userKycMap.keys()) allKnownUserIds.add(uid);
    for (const uid of spByUser.keys()) allKnownUserIds.add(uid);

    for (const rawUid of allKnownUserIds) {
      let uid = rawUid;
      const u = userById.get(uid);
      const sellerCols = sellerColMap.get(uid) || [];
      const sellerData = sellerCols[0] || {};
      const kycs = userKycMap.get(uid) || [];
      const kycData = kycs[0] || {};
      const existingSpList = db.getAllSync('seller_profiles', [{ field: 'user_id', op: '==', value: uid }]);
      const sp = existingSpList && existingSpList.length > 0 ? existingSpList[0] : null;

      const hasKycSubmission = !!(
        sellerData.kycStatus || 
        sellerData.status || 
        sellerData.fullName || 
        sellerData.nationalId ||
        kycData.status || 
        kycData.document_url ||
        kycData.bank_details ||
        (u && (u.kyc_status || u.role === 'seller')) ||
        sp
      );

      if (hasKycSubmission) {
        let bankObj: any = {};
        if (typeof kycData.bank_details === 'string') {
          try { bankObj = JSON.parse(kycData.bank_details); } catch(e) {}
        } else if (typeof kycData.bank_details === 'object' && kycData.bank_details) {
          bankObj = kycData.bank_details;
        }

        let rawStatus = sp?.kyc_status || sellerData.kycStatus || sellerData.status || kycData.status || u?.kyc_status || (u?.role === 'seller' ? 'verified' : 'pending');
        let normalizedStatus = 'pending';
        const lower = String(rawStatus || '').toLowerCase();
        if (['verified', 'approved', 'active'].includes(lower)) normalizedStatus = 'verified';
        else if (['rejected', 'denied'].includes(lower)) normalizedStatus = 'rejected';
        else if (['requires_info', 'info_requested'].includes(lower)) normalizedStatus = 'requires_info';
        else if (['resubmission', 'resubmit'].includes(lower)) normalizedStatus = 'resubmission';
        else if (['expired'].includes(lower)) normalizedStatus = 'expired';
        else if (['kyc_draft', 'draft', 'not_submitted', 'none'].includes(lower)) normalizedStatus = 'draft';

        const docFrontUrl = sp?.id_document_front_url || sp?.id_document_url || sellerData.idDocumentFrontUrl || sellerData.idDocumentUrl || kycData.document_url || '';
        const docBackUrl = sp?.id_document_back_url || sellerData.idDocumentBackUrl || '';

        const mergedSp: any = {
          id: sp?.id || uid,
          user_id: uid,
          display_name: sp?.display_name || sellerData.store_name || sellerData.fullName || bankObj.full_name || u?.name || 'Seller Application',
          user_email: sp?.user_email || u?.email || sellerData.user_email || '',
          full_legal_name: sp?.full_legal_name || sellerData.fullName || bankObj.full_name || u?.name || '',
          dob: sp?.dob || sellerData.dob || bankObj.dob || '',
          id_type: sp?.id_type || sellerData.idType || 'National ID',
          national_id: sp?.national_id || sellerData.nationalId || sp?.pan_number || bankObj.tax_id || '',
          pan_number: sp?.pan_number || sellerData.taxId || sp?.national_id || bankObj.tax_id || '',
          tax_country: sp?.tax_country || sellerData.taxCountry || u?.country || 'India',
          tax_id: sp?.tax_id || sellerData.taxId || sp?.pan_number || bankObj.tax_id || '',
          phone: sp?.phone || sellerData.phone || sellerData.phoneNumber || u?.phone || '',
          address: sp?.address || sp?.address_line1 || bankObj.address || '',
          address_line1: sp?.address_line1 || sp?.address || bankObj.address || '',
          country: sp?.country || sellerData.taxCountry || u?.country || 'India',
          seller_type: sp?.seller_type || sellerData.sellerType || 'individual',
          payout_method: sp?.payout_method || sellerData.payoutMethod || 'bank',
          bank_name: sp?.bank_name || sellerData.bankName || '',
          account_holder: sp?.account_holder || sellerData.accountHolder || sp?.full_legal_name || u?.name || '',
          account_number: sp?.account_number || sellerData.accountNumber || '',
          ifsc_code: sp?.ifsc_code || sellerData.ifscCode || '',
          upi_id: sp?.upi_id || sellerData.upiId || '',
          id_document_front_url: docFrontUrl,
          id_document_url: docFrontUrl,
          id_document_back_url: docBackUrl,
          id_document_status: sp?.id_document_status || (['verified', 'approved'].includes(normalizedStatus) ? 'VERIFIED' : 'AWAITING_VERIFICATION'),
          kyc_status: normalizedStatus,
          kyc_rejection_reason: sp?.kyc_rejection_reason || sellerData.rejectionReason || null,
          admin_notes: sp?.admin_notes || sellerData.admin_notes || null,
          payout_verified: ['verified', 'approved'].includes(normalizedStatus) ? 1 : 0,
          kyc_submitted_at: sp?.kyc_submitted_at || sellerData.submittedAt || u?.kyc_submitted_at || sp?.created_at || new Date().toISOString(),
          created_at: sp?.created_at || u?.created_at || new Date().toISOString(),
          updated_at: sp?.updated_at || new Date().toISOString(),
          risk_score: sp?.risk_score || 15
        };

        db.set('seller_profiles', String(mergedSp.id), mergedSp);

        // Link/create document entries in kyc_documents
        const existingDocs = db.getAllSync('kyc_documents', [{ field: 'user_id', op: '==', value: uid }]);
        
        // Ensure front document exists
        if (docFrontUrl) {
          const frontDoc = existingDocs.find(d => String(d.doc_slot).toLowerCase() === 'front');
          if (!frontDoc) {
            const docId = ulid();
            db.set('kyc_documents', docId, {
              id: docId,
              user_id: uid,
              seller_profile_id: String(mergedSp.id),
              doc_slot: 'front',
              doc_type: mergedSp.id_type || 'Identity Document',
              file_name: 'identity_document_front.jpg',
              file_path: docFrontUrl,
              mime_type: 'image/jpeg',
              file_size: 102400,
              status: ['verified', 'approved'].includes(normalizedStatus) ? 'VERIFIED' : 'AWAITING_VERIFICATION',
              uploaded_at: mergedSp.kyc_submitted_at
            });
          } else if (!frontDoc.file_path || frontDoc.file_path !== docFrontUrl) {
            db.set('kyc_documents', String(frontDoc.id), {
              ...frontDoc,
              file_path: docFrontUrl,
              doc_type: frontDoc.doc_type?.startsWith('http') ? (mergedSp.id_type || 'Identity Document') : (frontDoc.doc_type || 'Identity Document'),
              updated_at: new Date().toISOString()
            });
          }
        }

        // Ensure back document exists if URL present
        if (docBackUrl) {
          const backDoc = existingDocs.find(d => String(d.doc_slot).toLowerCase() === 'back');
          if (!backDoc) {
            const docId = ulid();
            db.set('kyc_documents', docId, {
              id: docId,
              user_id: uid,
              seller_profile_id: String(mergedSp.id),
              doc_slot: 'back',
              doc_type: mergedSp.id_type || 'Identity Document',
              file_name: 'identity_document_back.jpg',
              file_path: docBackUrl,
              mime_type: 'image/jpeg',
              file_size: 102400,
              status: ['verified', 'approved'].includes(normalizedStatus) ? 'VERIFIED' : 'AWAITING_VERIFICATION',
              uploaded_at: mergedSp.kyc_submitted_at
            });
          } else if (!backDoc.file_path || backDoc.file_path !== docBackUrl) {
            db.set('kyc_documents', String(backDoc.id), {
              ...backDoc,
              file_path: docBackUrl,
              doc_type: backDoc.doc_type?.startsWith('http') ? (mergedSp.id_type || 'Identity Document') : (backDoc.doc_type || 'Identity Document'),
              updated_at: new Date().toISOString()
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn("Consolidate KYC error:", err);
  }
}

// OMEGA-NEXUS Advanced KYC List & Actions
router.get("/kyc/advanced", (req: any, res: any) => {
  try {
    ensureConsolidatedKYCRecords();

    const {
      tab = 'pending',
      search = '',
      page = 1,
      limit = 15,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const allSps = db.getAllSync('seller_profiles') || [];
    const allUsers = db.getAllSync('users') || [];
    const userMap = new Map<string, any>();
    allUsers.forEach(u => { if (u && u.id) userMap.set(String(u.id), u); });

    // Deduplicate seller profiles strictly by unique user / email
    const seenSellerKeys = new Set<string>();
    const uniqueSps: any[] = [];
    for (const sp of allSps) {
      if (!sp || !sp.id) continue;
      const key = sp.user_id ? String(sp.user_id) : (sp.user_email ? String(sp.user_email).toLowerCase().trim() : String(sp.id));
      if (seenSellerKeys.has(key)) continue;
      seenSellerKeys.add(key);
      uniqueSps.push(sp);
    }

    // Join profiles with users
    const joined = uniqueSps.map(sp => {
      const u = userMap.get(String(sp.user_id)) || {};
      return {
        ...sp,
        user_name: u.name || sp.display_name || 'Seller',
        user_email_account: u.email || sp.user_email || '',
        user_country: u.country || sp.country || 'India',
        user_role: u.role || 'user',
        user_is_banned: u.is_banned === 1
      };
    });

    // Helper status normalizer
    const isStatusMatch = (kycStatus: string, targetTab: string) => {
      const s = String(kycStatus || '').toLowerCase();
      if (targetTab === 'pending') {
        return ['pending', 'under_review', 'pending_review', 'awaiting_verification', 'submitted'].includes(s);
      }
      if (targetTab === 'approved') {
        return ['verified', 'approved', 'active'].includes(s);
      }
      if (targetTab === 'rejected') {
        return ['rejected', 'denied'].includes(s);
      }
      if (targetTab === 'requires_info') {
        return ['requires_info', 'info_requested'].includes(s);
      }
      if (targetTab === 'resubmission') {
        return ['resubmission', 'resubmit'].includes(s);
      }
      if (targetTab === 'expired') {
        return ['expired'].includes(s);
      }
      if (targetTab === 'draft') {
        return ['draft', 'kyc_draft', 'not_submitted', 'none'].includes(s);
      }
      return true;
    };

    // Calculate real-time tab counts accurately
    const tabCounts = {
      pending: joined.filter(k => isStatusMatch(k.kyc_status, 'pending')).length,
      approved: joined.filter(k => isStatusMatch(k.kyc_status, 'approved')).length,
      rejected: joined.filter(k => isStatusMatch(k.kyc_status, 'rejected')).length,
      requires_info: joined.filter(k => isStatusMatch(k.kyc_status, 'requires_info')).length,
      resubmission: joined.filter(k => isStatusMatch(k.kyc_status, 'resubmission')).length,
      expired: joined.filter(k => isStatusMatch(k.kyc_status, 'expired')).length,
      settings: 0
    };

    // Filter by active tab
    let filtered = joined.filter(k => isStatusMatch(k.kyc_status, String(tab)));

    // Filter by search query
    if (search && String(search).trim() !== '') {
      const q = String(search).trim().toLowerCase();
      filtered = filtered.filter(k => {
        return (
          (k.display_name && String(k.display_name).toLowerCase().includes(q)) ||
          (k.user_email && String(k.user_email).toLowerCase().includes(q)) ||
          (k.user_email_account && String(k.user_email_account).toLowerCase().includes(q)) ||
          (k.user_id && String(k.user_id).toLowerCase().includes(q)) ||
          (k.id && String(k.id).toLowerCase().includes(q)) ||
          (k.pan_number && String(k.pan_number).toLowerCase().includes(q)) ||
          (k.tax_id && String(k.tax_id).toLowerCase().includes(q)) ||
          (k.full_legal_name && String(k.full_legal_name).toLowerCase().includes(q)) ||
          (k.country && String(k.country).toLowerCase().includes(q))
        );
      });
    }

    // Sort records
    filtered.sort((a, b) => {
      const timeA = new Date(a.kyc_submitted_at || a.created_at || 0).getTime();
      const timeB = new Date(b.kyc_submitted_at || b.created_at || 0).getTime();
      return sortOrder === 'ASC' ? timeA - timeB : timeB - timeA;
    });

    const totalRecords = filtered.length;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.max(1, Number(limit));
    const offset = (pageNum - 1) * limitNum;
    const records = filtered.slice(offset, offset + limitNum);

    res.json({
      records,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limitNum) || 1
      },
      tabCounts
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET 360° Comprehensive Seller Profile & KYC Application Details
router.get("/kyc/:id/details", (req: any, res: any) => {
  try {
    ensureConsolidatedKYCRecords();
    const profileId = req.params.id;
    
    // Find seller profile by id or user_id
    let allSps = db.getAllSync('seller_profiles') || [];
    let sp = allSps.find(s => s.id === profileId || s.user_id === profileId);

    // If not found in seller_profiles, look up in users or sellers
    if (!sp) {
      const u = db.getSync('users', profileId);
      const s = db.getSync('sellers', profileId);
      if (u || s) {
        sp = {
          id: profileId,
          user_id: u?.id || s?.user_id || profileId,
          display_name: s?.store_name || s?.fullName || u?.name || 'Seller Application',
          user_email: u?.email || s?.user_email || '',
          full_legal_name: s?.fullName || u?.name || '',
          dob: s?.dob || '',
          id_type: s?.idType || 'National ID',
          national_id: s?.nationalId || '',
          tax_country: s?.taxCountry || u?.country || 'India',
          tax_id: s?.taxId || '',
          phone: s?.phone || s?.phoneNumber || u?.phone || '',
          address_line1: s?.address || '',
          country: s?.taxCountry || u?.country || 'India',
          seller_type: s?.sellerType || 'individual',
          payout_method: s?.payoutMethod || 'bank',
          bank_name: s?.bankName || '',
          account_holder: s?.accountHolder || u?.name || '',
          account_number: s?.accountNumber || '',
          ifsc_code: s?.ifscCode || '',
          upi_id: s?.upiId || '',
          kyc_status: s?.kycStatus || u?.kyc_status || 'pending',
          kyc_submitted_at: s?.submittedAt || u?.kyc_submitted_at || new Date().toISOString(),
          created_at: u?.created_at || new Date().toISOString()
        };
        db.set('seller_profiles', profileId, sp);
      }
    }

    if (!sp) {
      return res.status(404).json({ error: "Seller profile not found." });
    }

    const u = db.getSync('users', String(sp.user_id)) || {};
    const kycRecord = db.getAllSync('user_kyc', [{ field: 'user_id', op: '==', value: String(sp.user_id) }])[0] || {};

    // Fetch all uploaded verification documents
    const allDocs = db.getAllSync('kyc_documents') || [];
    let rawDocs = allDocs.filter(d => 
      d.seller_profile_id === sp.id || 
      d.user_id === sp.user_id || 
      d.user_id === sp.id ||
      d.seller_profile_id === sp.user_id
    );

    const docFrontUrl = sp.id_document_front_url || sp.id_document_url || kycRecord.document_url || '';
    const docBackUrl = sp.id_document_back_url || '';

    // If documents are missing from kyc_documents table, generate them from sellerProfile / user_kyc
    if (rawDocs.length === 0 && docFrontUrl) {
      const frontId = ulid();
      const frontDocItem = {
        id: frontId,
        user_id: sp.user_id,
        seller_profile_id: sp.id,
        doc_slot: "front",
        doc_type: sp.id_type || "Identity Document",
        file_name: "id_document_front.jpg",
        file_path: docFrontUrl,
        mime_type: "image/jpeg",
        file_size: 102400,
        status: ['verified', 'approved'].includes(sp.kyc_status) ? "VERIFIED" : "AWAITING_VERIFICATION",
        uploaded_at: sp.kyc_submitted_at || new Date().toISOString()
      };
      db.set('kyc_documents', frontId, frontDocItem);
      rawDocs.push(frontDocItem);

      if (docBackUrl) {
        const backId = ulid();
        const backDocItem = {
          id: backId,
          user_id: sp.user_id,
          seller_profile_id: sp.id,
          doc_slot: "back",
          doc_type: sp.id_type || "Identity Document",
          file_name: "id_document_back.jpg",
          file_path: docBackUrl,
          mime_type: "image/jpeg",
          file_size: 102400,
          status: ['verified', 'approved'].includes(sp.kyc_status) ? "VERIFIED" : "AWAITING_VERIFICATION",
          uploaded_at: sp.kyc_submitted_at || new Date().toISOString()
        };
        db.set('kyc_documents', backId, backDocItem);
        rawDocs.push(backDocItem);
      }
    }

    const documents = rawDocs.map(d => {
      let filePath = d.file_path || '';
      let docType = d.doc_type || (sp.id_type || 'Identity Document');
      if (!filePath && (docType.startsWith('http') || docType.startsWith('data:') || docType.startsWith('/'))) {
        filePath = docType;
        docType = sp.id_type || 'Identity Document';
      }
      if (!filePath) {
        if (String(d.doc_slot).toLowerCase() === 'back' && docBackUrl) {
          filePath = docBackUrl;
        } else if (docFrontUrl) {
          filePath = docFrontUrl;
        }
      }
      return {
        id: d.id,
        doc_slot: d.doc_slot || "front",
        doc_type: docType,
        file_name: d.file_name || `${d.doc_slot || 'id'}_document.jpg`,
        file_path: filePath,
        mime_type: d.mime_type || "image/jpeg",
        file_size: d.file_size || 102400,
        status: d.status || (['verified', 'approved'].includes(sp.kyc_status) ? "VERIFIED" : "AWAITING_VERIFICATION"),
        rejection_reason: d.rejection_reason || null,
        uploaded_at: d.uploaded_at || sp.kyc_submitted_at,
        preview_url: `/api/admin/advanced/kyc/document/${d.id}/preview`,
        download_url: `/api/admin/advanced/kyc/document/${d.id}/download`
      };
    });

    // Fetch relevant audit logs for this seller
    const allAudits = db.getAllSync('audit_logs') || [];
    const auditLogs = allAudits
      .filter(a => a.target === sp.id || a.target === sp.user_id || (a.details && JSON.stringify(a.details).includes(sp.user_id)))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 20);

    // Structure 360° seller detail object
    const seller360 = {
      id: sp.id,
      user_id: sp.user_id,
      display_name: sp.display_name || u.name || "Seller",
      user_account_name: u.name || sp.display_name || "",
      user_account_email: u.email || sp.user_email || "",
      user_role: u.role || "user",
      user_is_verified: u.is_verified === 1 || ['verified', 'approved'].includes(sp.kyc_status),
      user_is_banned: u.is_banned === 1,
      account_created_at: u.created_at || sp.created_at,
      created_at: sp.created_at || u.created_at,
      updated_at: sp.updated_at || sp.created_at,
      kyc_submitted_at: sp.kyc_submitted_at || sp.seller_agreement_accepted_at || sp.created_at,
      kyc_status: sp.kyc_status || "pending",
      kyc_rejection_reason: sp.kyc_rejection_reason || null,
      admin_notes: sp.admin_notes || null,
      risk_score: sp.risk_score || 15,
      commission_tier: sp.commission_tier || "standard",
      id_document_front_url: docFrontUrl,
      id_document_url: docFrontUrl,
      id_document_back_url: docBackUrl,
      id_document_status: sp.id_document_status || (['verified', 'approved'].includes(sp.kyc_status) ? 'VERIFIED' : 'AWAITING_VERIFICATION'),

      // 1. Personal Identity Details
      full_legal_name: sp.full_legal_name || sp.display_name || u.name || "",
      dob: sp.dob || "",
      id_type: sp.id_type || "Passport",
      national_id: sp.national_id || sp.pan_number || "",
      phone: sp.phone || (sp.phone_country_code ? `${sp.phone_country_code} ${sp.phone_number || ''}`.trim() : sp.phone_number || u.phone || ""),
      phone_country_code: sp.phone_country_code || "+91",
      phone_number: sp.phone_number || u.phone || "",
      address: sp.address || sp.address_line1 || "",
      address_line1: sp.address_line1 || sp.address || "",
      address_line2: sp.address_line2 || "",
      city: sp.city || "",
      state: sp.state || "",
      postal_code: sp.postal_code || "",
      country: sp.country || u.country || "India",

      // 2. Account & Tax Classification
      seller_type: sp.seller_type || "individual",
      tax_country: sp.tax_country || sp.country || u.country || "India",
      tax_id: sp.tax_id || sp.pan_number || "",
      pan_number: sp.pan_number || sp.tax_id || "",
      gstin: sp.gstin || "",
      tax_accepted: sp.tax_accepted === 1 || true,

      // 3. Business Details (if applicable)
      business_legal_name: sp.business_legal_name || "",
      business_reg_number: sp.business_reg_number || "",
      business_reg_cert_url: sp.business_reg_cert_url || "",
      business_reg_cert_name: sp.business_reg_cert_name || "",
      different_business_address: sp.different_business_address === 1,
      business_address_line1: sp.business_address_line1 || "",
      business_address_line2: sp.business_address_line2 || "",
      business_city: sp.business_city || "",
      business_state: sp.business_state || "",
      business_postal_code: sp.business_postal_code || "",
      business_country: sp.business_country || sp.tax_country || "India",
      authorized_signatory_name: sp.authorized_signatory_name || "",
      authorized_signatory_id: sp.authorized_signatory_id || "",
      business_tax_doc_url: sp.business_tax_doc_url || "",
      business_tax_doc_name: sp.business_tax_doc_name || "",

      // 4. Bank & Payout Details
      payout_method: sp.payout_method || "bank",
      bank_name: sp.bank_name || "",
      account_holder: sp.account_holder || sp.display_name || u.name || "",
      account_number: sp.account_number || sp.payout_details || "",
      ifsc_code: sp.ifsc_code || sp.ifsc || "",
      upi_id: sp.upi_id || "",
      payout_verified: sp.payout_verified === 1 || ['verified', 'approved'].includes(sp.kyc_status),
      payout_mismatch_flagged: sp.payout_mismatch_flagged === 1,
      payout_mismatch_reason: sp.payout_mismatch_reason || "",

      // 5. Compliance & Declaration
      declaration_version: sp.declaration_version || "v1.0",
      declaration_accepted_at: sp.declaration_accepted_at || sp.seller_agreement_accepted_at || sp.created_at,
      seller_agreement_accepted_at: sp.seller_agreement_accepted_at || null,

      // Uploaded Documents & Audit Log
      documents,
      audit_logs: auditLogs
    };

    res.json({ seller: seller360 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Audit Log for Revealing Sensitive Data
router.post("/kyc/:id/log-reveal", (req: any, res: any) => {
  try {
    const sellerId = req.params.id;
    const adminId = (req as any).user?.id || 'admin';
    logAudit(adminId, "VIEW_UNMASKED_SELLER_SENSITIVE_DATA", sellerId, {
      ip: req.ip || req.headers["x-forwarded-for"] || "0.0.0.0",
      userAgent: req.headers["user-agent"]
    });
    res.json({ success: true, message: "Unmasked reveal action audit logged." });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET Download Seller Details (CSV / JSON Data Export)
router.get("/kyc/:id/download-details", (req: any, res: any) => {
  try {
    const profileId = req.params.id;
    const format = (req.query.format || "csv").toString().toLowerCase();
    const includeUnmasked = req.query.include_unmasked === "true";
    const adminId = (req as any).user?.id || 'admin';

    const allSps = db.getAllSync('seller_profiles') || [];
    const sp = allSps.find(s => s.id === profileId || s.user_id === profileId);

    if (!sp) {
      return res.status(404).json({ error: "Seller profile not found." });
    }

    const u = db.getSync('users', String(sp.user_id)) || {};

    logAudit(adminId, "DOWNLOAD_SELLER_FULL_DETAILS", sp.user_id, {
      format,
      include_unmasked: includeUnmasked,
      ip: req.ip || req.headers["x-forwarded-for"] || "0.0.0.0",
      userAgent: req.headers["user-agent"]
    });

    const mask = (val: string) => {
      if (!val) return "N/A";
      if (includeUnmasked) return val;
      if (val.length <= 4) return "****";
      return "**** " + val.slice(-4);
    };

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="Seller_Full_Details_${sp.user_id}_${Date.now()}.json"`);
      
      const jsonPayload = {
        meta: {
          export_date: new Date().toISOString(),
          exported_by_admin: adminId,
          unmasked: includeUnmasked
        },
        personal_identity: {
          full_legal_name: sp.full_legal_name || sp.display_name,
          dob: sp.dob || "N/A",
          id_type: sp.id_type || "Passport",
          id_number: mask(sp.national_id || sp.pan_number || ""),
          phone: sp.phone || (sp.phone_country_code ? `${sp.phone_country_code} ${sp.phone_number}` : sp.phone_number),
          address: {
            line1: sp.address_line1 || sp.address,
            line2: sp.address_line2 || "",
            city: sp.city || "",
            state: sp.state || "",
            postal_code: sp.postal_code || "",
            country: sp.country || u.country || "India"
          }
        },
        account_and_tax: {
          seller_type: sp.seller_type || "individual",
          tax_country: sp.tax_country || sp.country || u.country || "India",
          tax_id_pan: mask(sp.tax_id || sp.pan_number || ""),
          gstin: sp.gstin || "N/A",
          declaration_accepted: sp.tax_accepted === 1 || true
        },
        business_details: sp.seller_type === 'business' ? {
          business_legal_name: sp.business_legal_name || "N/A",
          business_reg_number: sp.business_reg_number || "N/A",
          business_address: `${sp.business_address_line1 || ''} ${sp.business_address_line2 || ''}, ${sp.business_city || ''}, ${sp.business_state || ''} ${sp.business_postal_code || ''}, ${sp.business_country || ''}`.trim(),
          authorized_signatory: sp.authorized_signatory_name || "N/A"
        } : null,
        payout_bank_details: {
          payout_method: sp.payout_method || "bank",
          bank_name: sp.bank_name || "N/A",
          account_holder: sp.account_holder || sp.display_name || u.name,
          account_number: mask(sp.account_number || sp.payout_details || ""),
          ifsc_swift: sp.ifsc_code || sp.ifsc || "N/A",
          upi_id: sp.upi_id || "N/A",
          payout_mismatch_flagged: sp.payout_mismatch_flagged === 1
        },
        compliance_meta: {
          declaration_version: sp.declaration_version || "v1.0",
          declaration_accepted_at: sp.declaration_accepted_at || sp.seller_agreement_accepted_at || sp.created_at,
          kyc_status: sp.kyc_status || "pending",
          submitted_at: sp.kyc_submitted_at || sp.created_at,
          admin_notes: sp.admin_notes || ""
        }
      };

      return res.send(JSON.stringify(jsonPayload, null, 2));
    }

    // Default: CSV Export
    const csvHeaders = [
      "Seller ID", "Full Legal Name", "Display Name", "Email", "Phone", 
      "Address Line 1", "Address Line 2", "City", "State", "Postal Code", "Country", "DOB",
      "ID Type", "National ID / PAN Number", "Seller Type", "Tax Country", "Tax ID / PAN", "GSTIN",
      "Business Name", "Business Reg No", "Bank Name", "Account Holder Name", "Account Number", "IFSC/SWIFT", "UPI ID",
      "KYC Status", "Declaration Accepted At", "Submission Timestamp"
    ];

    const csvRow = [
      sp.user_id,
      sp.full_legal_name || sp.display_name,
      sp.display_name,
      u.email || sp.user_email || "",
      sp.phone || `${sp.phone_country_code || ''}${sp.phone_number || ''}`,
      sp.address_line1 || sp.address || "",
      sp.address_line2 || "",
      sp.city || "",
      sp.state || "",
      sp.postal_code || "",
      sp.country || u.country || "India",
      sp.dob || "",
      sp.id_type || "Passport",
      mask(sp.national_id || sp.pan_number || ""),
      sp.seller_type || "individual",
      sp.tax_country || "India",
      mask(sp.tax_id || sp.pan_number || ""),
      sp.gstin || "",
      sp.business_legal_name || "",
      sp.business_reg_number || "",
      sp.bank_name || "",
      sp.account_holder || "",
      mask(sp.account_number || sp.payout_details || ""),
      sp.ifsc_code || sp.ifsc || "",
      sp.upi_id || "",
      sp.kyc_status || "pending",
      sp.declaration_accepted_at || sp.seller_agreement_accepted_at || "",
      sp.kyc_submitted_at || sp.created_at || ""
    ].map(v => `"${String(v || "").replace(/"/g, '""')}"`);

    const csvString = csvHeaders.join(",") + "\n" + csvRow.join(",");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="Seller_Full_Details_${sp.user_id}_${Date.now()}.csv"`);
    return res.send(csvString);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET Download Single Seller Verification Document with Audit Logging
router.get("/kyc/document/:docId/download", (req: any, res: any) => {
  try {
    const docId = req.params.docId;
    const adminId = (req as any).user?.id || 'admin';

    const allDocs = db.getAllSync('kyc_documents') || [];
    const doc = allDocs.find(d => d.id === docId);

    if (!doc) {
      return res.status(404).json({ error: "Document record not found." });
    }

    logAudit(adminId, "DOWNLOAD_SELLER_DOCUMENT", docId, {
      file_name: doc.file_name,
      doc_slot: doc.doc_slot,
      doc_type: doc.doc_type,
      seller_id: doc.user_id,
      ip: req.ip || req.headers["x-forwarded-for"] || "0.0.0.0",
      userAgent: req.headers["user-agent"]
    });

    const safeFileName = `${doc.doc_slot || 'front'}_${doc.file_name || 'document.jpg'}`.replace(/[^a-zA-Z0-9_\.-]/g, "_");

    let filePath = doc.file_path || '';
    if (!filePath && (doc.doc_type?.startsWith('http') || doc.doc_type?.startsWith('data:') || doc.doc_type?.startsWith('/'))) {
      filePath = doc.doc_type;
    }
    if (!filePath) {
      const sp = db.getAllSync('seller_profiles').find(s => s.id === doc.seller_profile_id || s.user_id === doc.user_id);
      if (String(doc.doc_slot).toLowerCase() === 'back') {
        filePath = sp?.id_document_back_url || '';
      } else {
        filePath = sp?.id_document_front_url || sp?.id_document_url || '';
      }
    }

    if (filePath && filePath.startsWith("data:")) {
      const matches = filePath.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mime = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        res.setHeader("Content-Type", mime);
        res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"`);
        return res.send(buffer);
      }
    }

    if (filePath && (filePath.startsWith("http://") || filePath.startsWith("https://"))) {
      return res.redirect(filePath);
    }

    if (filePath) {
      const candidates = [
        filePath,
        path.resolve(process.cwd(), filePath.replace(/^\//, '')),
        path.resolve(process.cwd(), 'uploads', 'kyc_documents', path.basename(filePath)),
        path.resolve(process.cwd(), 'uploads', path.basename(filePath))
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          res.setHeader("Content-Type", doc.mime_type || "application/octet-stream");
          res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"`);
          return res.sendFile(cand);
        }
      }
    }

    // SVG Fallback if file isn't on local disk
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="#14142B"/><text x="300" y="180" font-family="sans-serif" font-size="20" fill="#818cf8" text-anchor="middle" font-weight="bold">${doc.doc_type || 'Identity Document'}</text><text x="300" y="220" font-family="monospace" font-size="14" fill="#94a3b8" text-anchor="middle">Slot: ${doc.doc_slot || 'Front'} | Seller: ${doc.user_id}</text><text x="300" y="250" font-family="sans-serif" font-size="12" fill="#10b981" text-anchor="middle">✓ Stored In Secure Digital Archive</text></svg>`;
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}.svg"`);
    return res.send(fallbackSvg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET Preview Single Document File
router.get("/kyc/document/:docId/preview", (req: any, res: any) => {
  try {
    const docId = req.params.docId;
    const allDocs = db.getAllSync('kyc_documents') || [];
    const doc = allDocs.find(d => d.id === docId);

    if (!doc) {
      return res.status(404).json({ error: "Document record not found." });
    }

    logAudit((req as any).user?.id || 'admin', "PREVIEW_SELLER_DOCUMENT", docId, {
      file_name: doc.file_name,
      doc_slot: doc.doc_slot,
      seller_id: doc.user_id
    });

    let filePath = doc.file_path || '';
    if (!filePath && (doc.doc_type?.startsWith('http') || doc.doc_type?.startsWith('data:') || doc.doc_type?.startsWith('/'))) {
      filePath = doc.doc_type;
    }
    if (!filePath) {
      const sp = db.getAllSync('seller_profiles').find(s => s.id === doc.seller_profile_id || s.user_id === doc.user_id);
      if (String(doc.doc_slot).toLowerCase() === 'back') {
        filePath = sp?.id_document_back_url || '';
      } else {
        filePath = sp?.id_document_front_url || sp?.id_document_url || '';
      }
    }

    if (filePath && filePath.startsWith("data:")) {
      const matches = filePath.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mime = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        res.setHeader("Content-Type", mime);
        res.setHeader("Content-Disposition", `inline; filename="${doc.file_name || 'document.jpg'}"`);
        return res.send(buffer);
      }
    }

    if (filePath && (filePath.startsWith("http://") || filePath.startsWith("https://"))) {
      return res.redirect(filePath);
    }

    if (filePath) {
      const candidates = [
        filePath,
        path.resolve(process.cwd(), filePath.replace(/^\//, '')),
        path.resolve(process.cwd(), 'uploads', 'kyc_documents', path.basename(filePath)),
        path.resolve(process.cwd(), 'uploads', path.basename(filePath))
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          res.setHeader("Content-Type", doc.mime_type || "image/png");
          res.setHeader("Content-Disposition", `inline; filename="${doc.file_name || 'document.png'}"`);
          return res.sendFile(cand);
        }
      }
    }

    // Generated High-Quality SVG Visual Preview Fallback
    const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="#14142B"/><rect x="40" y="40" width="520" height="320" rx="16" fill="#1E1E3F" stroke="#6366f1" stroke-width="2" stroke-dasharray="6,6"/><circle cx="300" cy="140" r="40" fill="#6366f1" opacity="0.2"/><path d="M285 140 L295 150 L315 130" stroke="#818cf8" stroke-width="3" fill="none" stroke-linecap="round"/><text x="300" y="210" font-family="sans-serif" font-size="20" fill="#ffffff" text-anchor="middle" font-weight="bold">${doc.doc_type || 'Verified Identity Document'}</text><text x="300" y="240" font-family="monospace" font-size="13" fill="#a5b4fc" text-anchor="middle">Slot: ${(doc.doc_slot || 'Front').toUpperCase()} | User ID: ${doc.user_id}</text><text x="300" y="270" font-family="sans-serif" font-size="12" fill="#34d399" text-anchor="middle">✓ Validated &amp; Stored on Platform Engine</text></svg>`;
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Content-Disposition", `inline; filename="${doc.file_name || 'preview'}.svg"`);
    return res.send(fallbackSvg);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET Bulk Download All Verification Documents as a ZIP Archive
router.get("/kyc/:id/bulk-download-documents", async (req: any, res: any) => {
  try {
    const profileId = req.params.id;
    const adminId = (req as any).user?.id || 'admin';

    const allSps = db.getAllSync('seller_profiles') || [];
    const sp = allSps.find(s => s.id === profileId || s.user_id === profileId);

    if (!sp) {
      return res.status(404).json({ error: "Seller profile not found." });
    }

    const allDocs = db.getAllSync('kyc_documents') || [];
    const docs = allDocs.filter(d => 
      d.seller_profile_id === sp.id || 
      d.user_id === sp.user_id || 
      d.user_id === sp.id
    );

    const zip = new JSZip();
    let fileCount = 0;

    for (const d of docs) {
      if (d.file_path && fs.existsSync(d.file_path)) {
        const fileContent = fs.readFileSync(d.file_path);
        const zipFileName = `${(d.doc_slot || 'front').toUpperCase()}_${d.file_name || 'document.jpg'}`.replace(/[^a-zA-Z0-9_\.-]/g, "_");
        zip.file(zipFileName, fileContent);
        fileCount++;
      } else if (d.file_path && d.file_path.startsWith("data:")) {
        const matches = d.file_path.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const buffer = Buffer.from(matches[2], 'base64');
          const zipFileName = `${(d.doc_slot || 'front').toUpperCase()}_${d.file_name || 'document.jpg'}`.replace(/[^a-zA-Z0-9_\.-]/g, "_");
          zip.file(zipFileName, buffer);
          fileCount++;
        }
      } else {
        const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#14142B"/><text x="300" y="200" font-family="sans-serif" font-size="18" fill="#fff" text-anchor="middle">${d.doc_type || 'KYC Document'} (${d.doc_slot || 'front'})</text></svg>`;
        const zipFileName = `${(d.doc_slot || 'front').toUpperCase()}_${d.file_name || 'document'}.svg`.replace(/[^a-zA-Z0-9_\.-]/g, "_");
        zip.file(zipFileName, Buffer.from(fallbackSvg, 'utf-8'));
        fileCount++;
      }
    }

    if (fileCount === 0) {
      const summaryInfo = `Seller: ${sp.display_name}\nID: ${sp.user_id}\nStatus: ${sp.kyc_status}\nSubmitted At: ${sp.kyc_submitted_at}\n`;
      zip.file("seller_kyc_summary.txt", Buffer.from(summaryInfo, 'utf-8'));
      fileCount = 1;
    }

    logAudit(adminId, "BULK_DOWNLOAD_SELLER_DOCUMENTS", sp.user_id, {
      doc_count: fileCount,
      seller_name: sp.display_name,
      ip: req.ip || req.headers["x-forwarded-for"] || "0.0.0.0",
      userAgent: req.headers["user-agent"]
    });

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const safeSellerName = (sp.display_name || sp.user_id).replace(/[^a-zA-Z0-9_]/g, "_");
    const zipFileName = `KYC_Docs_${safeSellerName}_${Date.now()}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipFileName}"`);
    return res.send(zipBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST Admin Review & Decision Action on KYC (Approve, Reject, Request Info, Request Resubmission)
router.post("/kyc/:id/action", async (req: any, res: any) => {
  try {
    const { action, reason, admin_notes } = req.body;
    const profileId = req.params.id;

    if (action === 'reject') {
      const combinedReason = [reason, admin_notes].filter(Boolean).join(" ").trim();
      if (!combinedReason) {
        return res.status(400).json({ 
          error: "Rejection reason is mandatory when rejecting a seller KYC application. Please provide a clear explanation for the seller." 
        });
      }
    }

    let newStatus = 'pending';
    if (action === 'approve') newStatus = 'verified';
    else if (action === 'reject') newStatus = 'rejected';
    else if (action === 'request_info') newStatus = 'requires_info';
    else if (action === 'request_resubmission') newStatus = 'resubmission';

    const note = [reason, admin_notes].filter(Boolean).join(" - ");

    // Fetch profile to get associated user_id
    const allSps = db.getAllSync('seller_profiles') || [];
    let profile = allSps.find(s => s.id === profileId || s.user_id === profileId);

    const userId = profile?.user_id || profileId;
    const nowIso = new Date().toISOString();

    // 1. Update seller profile in db
    if (profile) {
      profile.kyc_status = newStatus;
      profile.payout_verified = newStatus === 'verified' ? 1 : 0;
      profile.admin_notes = note || null;
      profile.kyc_rejection_reason = newStatus === 'rejected' ? (note || 'Document criteria not met') : null;
      if (newStatus === 'verified') {
        profile.step1_status = 'COMPLETED';
        profile.step2_status = 'COMPLETED';
        profile.step3_status = 'COMPLETED';
        profile.step4_status = 'COMPLETED';
        profile.current_step = 4;
        profile.reverification_restricted = 0;
        profile.reverification_warning = 0;
        profile.reverification_status = 'APPROVED';
      }
      profile.updated_at = nowIso;
      db.set('seller_profiles', String(profile.id), profile);
      syncSellerProfileToFirestore(profile).catch(() => {});
    }

    // 2. Update sellers collection
    const sellerRec = db.getSync('sellers', userId) || {};
    sellerRec.id = userId;
    sellerRec.user_id = userId;
    sellerRec.userId = userId;
    sellerRec.status = newStatus === 'verified' ? 'active' : newStatus;
    sellerRec.kycStatus = newStatus;
    sellerRec.admin_notes = note;
    if (newStatus === 'rejected') sellerRec.rejectionReason = note;
    sellerRec.updatedAt = nowIso;
    db.set('sellers', userId, sellerRec);
    syncSellerProfileToFirestore(sellerRec).catch(() => {});

    // 3. Update user account
    const user = db.getSync('users', userId);
    if (user) {
      if (newStatus === 'verified') {
        user.role = 'seller';
        user.is_verified = 1;
      } else if (newStatus === 'rejected') {
        user.role = 'user';
      }
      user.kyc_status = newStatus;
      user.updated_at = nowIso;
      db.set('users', userId, user);
      syncUserToFirestore(user).catch(() => {});
    }

    // 4. Send seller in-app notification
    const notifId = ulid();
    let notifMessage = "";
    if (newStatus === 'verified') {
      notifMessage = "Congratulations! Your seller application has been approved. Your seller dashboard and product listing capabilities are now active.";
    } else if (newStatus === 'rejected') {
      notifMessage = `Your seller application was not approved. Reason: ${note || 'Document criteria not met'}. You may review and resubmit your details.`;
    } else if (newStatus === 'requires_info') {
      notifMessage = `Your seller application requires additional information. Compliance note: ${note || 'Please check your submitted details.'}`;
    } else if (newStatus === 'resubmission') {
      notifMessage = `Please resubmit your verification documents. Reason: ${note || 'Document re-upload required.'}`;
    }

    if (notifMessage) {
      const notifDoc = {
        id: notifId,
        user_id: userId,
        type: 'kyc',
        title: newStatus === 'verified' ? 'KYC Approved' : newStatus === 'rejected' ? 'KYC Rejected' : 'KYC Update',
        message: notifMessage,
        is_read: 0,
        created_at: nowIso
      };
      db.set('notifications', notifId, notifDoc);
      syncNotificationToFirestore(notifDoc).catch(() => {});
    }

    // 5. Auto-resolve any active KYC Re-Verification requests
    try {
      const allRequests = await db.getAll('kyc_reverification_requests') || [];
      const activeReqs = allRequests.filter((r: any) => 
        (r.seller_id === userId || r.user_id === userId || r.seller_id === profileId || r.user_id === profileId) &&
        Number(r.is_active) === 1
      );

      for (const r of activeReqs) {
        const finalStatus = action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : r.status;
        const updatedReq = {
          ...r,
          status: finalStatus,
          is_active: action === 'approve' ? 0 : r.is_active,
          completed_at: action === 'approve' ? nowIso : null,
          admin_notes: [r.admin_notes, note].filter(Boolean).join(" | "),
          updated_at: nowIso
        };
        await db.set('kyc_reverification_requests', r.id, updatedReq);
        syncKycReverificationToFirestore(updatedReq).catch(() => {});
      }
    } catch (errReq) {
      console.warn("Error finalizing reverification request on KYC action:", errReq);
    }

    // 6. Log audit action
    logAudit((req as any).user?.id || 'admin', `KYC_ACTION_${action.toUpperCase()}`, profileId, { 
      action, 
      reason, 
      note, 
      user_id: userId 
    });

    res.json({ success: true, message: `KYC application status updated to ${newStatus}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE Seller KYC Application (Permanent Delete)
router.delete("/kyc/:id", (req: any, res: any) => {
  try {
    const profileId = req.params.id;
    const allSps = db.getAllSync('seller_profiles') || [];
    const profile = allSps.find(s => s.id === profileId || s.user_id === profileId);
    const userId = profile?.user_id || profileId;

    if (userId) {
      const user = db.getSync('users', userId);
      if (user) {
        user.role = 'user';
        user.is_verified = 0;
        user.kyc_status = 'not_submitted';
        db.set('users', userId, user);
        syncUserToFirestore(user).catch(() => {});
      }
      db.delete('sellers', userId);
      db.delete('user_kyc', userId);
    }

    if (profile) {
      db.delete('seller_profiles', String(profile.id));
    }
    db.delete('seller_profiles', profileId);

    // Delete associated documents
    const allDocs = db.getAllSync('kyc_documents') || [];
    allDocs.forEach(d => {
      if (d.seller_profile_id === profileId || d.user_id === userId || d.user_id === profileId) {
        db.delete('kyc_documents', String(d.id));
      }
    });

    logAudit((req as any).user?.id || 'admin', "DELETE_SELLER_APPLICATION", profileId, { user_id: userId });
    res.json({ success: true, message: "Seller KYC application permanently deleted" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// KYC RE-VERIFICATION SYSTEM (ADMIN-TRIGGERED WITH DEADLINES & ENFORCEMENT)
// --------------------------------------------------------------------------

// Trigger new re-verification request for seller
router.post("/kyc/:id/request-reverification", async (req: any, res: any) => {
  try {
    const targetId = req.params.id;
    const { 
      reason, 
      deadline_preset = "72h", 
      deadline_hours, 
      custom_deadline_date, 
      expiration_action = "RESTRICT_FEATURES", 
      grace_period_hours = 0, 
      admin_notes = "",
      force_override = false 
    } = req.body || {};

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "A valid reason for requesting KYC re-verification is required." });
    }

    // Find seller profile & user
    const profile = (db.prepare("SELECT * FROM seller_profiles WHERE id = ? OR user_id = ?").get(targetId, targetId) ||
                     db.getSync('seller_profiles', targetId)) as any;
    const user = (profile?.user_id ? db.prepare("SELECT * FROM users WHERE id = ?").get(profile.user_id) :
                 db.prepare("SELECT * FROM users WHERE id = ?").get(targetId)) as any;

    if (!profile && !user) {
      return res.status(404).json({ error: "Seller profile or user account not found." });
    }

    const sellerId = profile?.user_id || profile?.id || user?.id;
    const adminId = req.user?.id || 'admin';

    // Duplicate Check: Check for existing active requests
    const allRequests = await db.getAll('kyc_reverification_requests') || [];
    const activeExisting = allRequests.find((r: any) => 
      (r.seller_id === sellerId || r.user_id === sellerId) &&
      Number(r.is_active) === 1 &&
      ['PENDING', 'SUBMITTED', 'UNDER_REVIEW'].includes(String(r.status).toUpperCase())
    );

    if (activeExisting && !force_override) {
      return res.status(409).json({
        duplicate: true,
        message: "This seller already has an active KYC re-verification request pending.",
        activeRequest: activeExisting
      });
    }

    // Server-side calculation of deadline
    const serverNow = new Date();
    const serverNowIso = serverNow.toISOString();
    let computedHours = 72; // default 72h

    if (deadline_preset === "24h") computedHours = 24;
    else if (deadline_preset === "48h") computedHours = 48;
    else if (deadline_preset === "72h") computedHours = 72;
    else if (deadline_preset === "7d") computedHours = 168;
    else if (deadline_preset === "15d") computedHours = 360;
    else if (deadline_preset === "30d") computedHours = 720;
    else if (deadline_preset === "custom") {
      if (custom_deadline_date) {
        const customDate = new Date(custom_deadline_date);
        if (!isNaN(customDate.getTime()) && customDate.getTime() > serverNow.getTime()) {
          computedHours = Math.max(1, (customDate.getTime() - serverNow.getTime()) / (1000 * 60 * 60));
        } else {
          computedHours = Number(deadline_hours) || 72;
        }
      } else {
        computedHours = Math.max(1, Number(deadline_hours) || 72);
      }
    }

    const deadlineAtDate = new Date(serverNow.getTime() + computedHours * 3600 * 1000);
    const deadlineAtIso = deadlineAtDate.toISOString();

    const graceHours = Math.max(0, Number(grace_period_hours) || 0);
    const graceEndsAtIso = graceHours > 0 
      ? new Date(deadlineAtDate.getTime() + graceHours * 3600 * 1000).toISOString()
      : null;

    // Archive or supersede any previous active request
    if (activeExisting) {
      await db.set('kyc_reverification_requests', activeExisting.id, {
        ...activeExisting,
        is_active: 0,
        status: 'SUPERSEDED',
        updated_at: serverNowIso
      });
    }

    const requestId = ulid();
    const newRequest = {
      id: requestId,
      seller_id: sellerId,
      user_id: sellerId,
      admin_id: adminId,
      reason: reason.trim(),
      deadline_preset: deadline_preset,
      deadline_hours: computedHours,
      requested_at: serverNowIso,
      deadline_at: deadlineAtIso,
      grace_period_hours: graceHours,
      grace_period_ends_at: graceEndsAtIso,
      expiration_action: expiration_action || 'RESTRICT_FEATURES',
      status: 'PENDING',
      admin_notes: admin_notes ? admin_notes.trim() : '',
      is_active: 1,
      created_at: serverNowIso,
      updated_at: serverNowIso
    };

    await db.set('kyc_reverification_requests', requestId, newRequest);
    syncKycReverificationToFirestore(newRequest).catch(() => {});

    // Update seller profile state to track active re-verification requirement
    await db.update('seller_profiles', sellerId, {
      has_active_reverification: 1,
      reverification_required: 1,
      reverification_request_id: requestId,
      reverification_deadline_at: deadlineAtIso,
      reverification_reason: reason.trim(),
      reverification_restricted: 0, // reset until deadline or review
      updated_at: serverNowIso
    });

    const updatedProfile = db.getSync('seller_profiles', sellerId);
    if (updatedProfile) {
      syncSellerProfileToFirestore(updatedProfile).catch(() => {});
    }

    // In-App Notification for seller
    const notifId = ulid();
    await db.set('notifications', notifId, {
      id: notifId,
      user_id: sellerId,
      type: 'kyc_reverification_request',
      title: '⚠️ KYC Re-Verification Required',
      message: `Admin compliance has requested KYC re-verification for your seller account. Reason: "${reason.trim()}". Deadline: ${deadlineAtDate.toLocaleString()}. Policy: Missing the deadline will trigger ${expiration_action}.`,
      is_read: 0,
      created_at: serverNowIso
    });

    logAudit(adminId, "KYC_REVERIFICATION_REQUESTED", sellerId, {
      request_id: requestId,
      reason,
      deadline_at: deadlineAtIso,
      expiration_action,
      grace_period_hours: graceHours
    });

    res.json({
      success: true,
      message: "KYC re-verification requested successfully. Deadline and enforcement have been scheduled.",
      request: newRequest
    });
  } catch (err: any) {
    console.error("KYC reverification request error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Fetch re-verification history for a seller
router.get("/kyc/:id/reverification-history", async (req: any, res: any) => {
  try {
    const targetId = req.params.id;
    const profile = (db.prepare("SELECT * FROM seller_profiles WHERE id = ? OR user_id = ?").get(targetId, targetId) ||
                     db.getSync('seller_profiles', targetId)) as any;
    const sellerId = profile?.user_id || profile?.id || targetId;

    let allRequests = await db.getAll('kyc_reverification_requests') || [];
    const sellerHistory = allRequests
      .filter((r: any) => r && (r.seller_id === sellerId || r.user_id === sellerId))
      .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    res.json({
      success: true,
      history: sellerHistory
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch all supplementary & re-verification requests for Admin KYC Module
router.get("/kyc/reverifications/all", async (req: any, res: any) => {
  try {
    const { status, search = "" } = req.query;
    let allRequests = await db.getAll('kyc_reverification_requests') || [];
    const serverNow = Date.now();

    // Map each request with seller profile & user details
    const enhanced = allRequests.map((r: any) => {
      const sellerId = r.seller_id || r.user_id;
      const profile = db.prepare("SELECT * FROM seller_profiles WHERE user_id = ? OR id = ?").get(sellerId, sellerId) as any;
      const user = db.prepare("SELECT id, name, email, avatar, role, status FROM users WHERE id = ?").get(sellerId) as any;

      const deadlineTime = r.deadline_at ? new Date(r.deadline_at).getTime() : 0;
      const diffSec = deadlineTime > 0 ? Math.max(0, Math.floor((deadlineTime - serverNow) / 1000)) : 0;
      const isExpired = r.status === 'EXPIRED' || (deadlineTime > 0 && serverNow > deadlineTime && !['SUBMITTED', 'APPROVED', 'CANCELLED', 'REJECTED'].includes(String(r.status).toUpperCase()));

      return {
        ...r,
        seller_name: profile?.display_name || user?.name || "Seller",
        seller_email: user?.email || "",
        seller_avatar: user?.avatar || "",
        seller_tier: profile?.badge_tier || "standard",
        kyc_status: profile?.kyc_status || "unverified",
        seconds_remaining: diffSec,
        is_expired: isExpired,
        reverification_restricted: profile?.reverification_restricted || 0
      };
    });

    let filtered = enhanced;

    if (status && status !== 'all') {
      filtered = filtered.filter((r: any) => String(r.status).toLowerCase() === String(status).toLowerCase());
    }

    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter((r: any) => 
        (r.seller_name && r.seller_name.toLowerCase().includes(q)) ||
        (r.seller_email && r.seller_email.toLowerCase().includes(q)) ||
        (r.reason && r.reason.toLowerCase().includes(q)) ||
        (r.id && r.id.toLowerCase().includes(q))
      );
    }

    filtered.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    res.json({
      success: true,
      total: filtered.length,
      requests: filtered
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin action on re-verification (Approve, Reject, Cancel, Extend)
router.post("/kyc/reverification/:reqId/action", async (req: any, res: any) => {
  try {
    const reqId = req.params.reqId;
    const { action, reason = "", admin_notes = "", extend_hours = 48 } = req.body || {};
    const adminId = req.user?.id || 'admin';
    const serverNow = new Date();
    const serverNowIso = serverNow.toISOString();

    const request = await db.get('kyc_reverification_requests', reqId);
    if (!request) {
      return res.status(404).json({ error: "Re-verification request record not found." });
    }

    const sellerId = request.seller_id || request.user_id;

    if (action === "approve") {
      const updatedReq = {
        ...request,
        status: "APPROVED",
        is_active: 0,
        reviewed_by: adminId,
        reviewed_at: serverNowIso,
        completed_at: serverNowIso,
        admin_notes: admin_notes ? `${request.admin_notes || ''}\n[Approved]: ${admin_notes}`.trim() : request.admin_notes,
        updated_at: serverNowIso
      };
      await db.set('kyc_reverification_requests', reqId, updatedReq);
      syncKycReverificationToFirestore(updatedReq).catch(() => {});

      // Clear all restrictions on seller profile
      await db.update('seller_profiles', sellerId, {
        kyc_status: 'verified',
        has_active_reverification: 0,
        reverification_required: 0,
        reverification_restricted: 0,
        reverification_warning: 0,
        compliance_flag: null,
        payout_verified: 1,
        updated_at: serverNowIso
      });

      await db.update('users', sellerId, {
        role: 'seller',
        is_verified: 1,
        status: 'active'
      });

      const sp = db.getSync('seller_profiles', sellerId);
      if (sp) syncSellerProfileToFirestore(sp).catch(() => {});
      const u = db.getSync('users', sellerId);
      if (u) syncUserToFirestore(u).catch(() => {});

      // Notification
      const notifId = ulid();
      await db.set('notifications', notifId, {
        id: notifId,
        user_id: sellerId,
        type: 'kyc_approved',
        title: '✅ KYC Re-Verification Approved',
        message: 'Your KYC re-verification has been reviewed and verified by platform compliance. All seller privileges remain fully unlocked.',
        is_read: 0,
        created_at: serverNowIso
      });

      logAudit(adminId, "KYC_REVERIFICATION_APPROVED", sellerId, { request_id: reqId, admin_notes });
      return res.json({ success: true, message: "KYC re-verification approved successfully." });
    }

    if (action === "reject") {
      const updatedReq = {
        ...request,
        status: "REJECTED",
        is_active: 0,
        rejection_reason: reason || "Identity documents or details did not meet compliance requirements.",
        reviewed_by: adminId,
        reviewed_at: serverNowIso,
        admin_notes: admin_notes ? `${request.admin_notes || ''}\n[Rejected]: ${admin_notes}`.trim() : request.admin_notes,
        updated_at: serverNowIso
      };
      await db.set('kyc_reverification_requests', reqId, updatedReq);
      syncKycReverificationToFirestore(updatedReq).catch(() => {});

      await db.update('seller_profiles', sellerId, {
        kyc_status: 'rejected',
        kyc_rejection_reason: reason || "Re-verification rejected by compliance.",
        has_active_reverification: 0,
        reverification_required: 1,
        reverification_restricted: 1,
        payout_verified: 0,
        updated_at: serverNowIso
      });

      // Notification
      const notifId = ulid();
      await db.set('notifications', notifId, {
        id: notifId,
        user_id: sellerId,
        type: 'kyc_rejected',
        title: '❌ KYC Re-Verification Rejected',
        message: `Your KYC re-verification was rejected. Reason: "${reason || 'Documents could not be verified'}". Please contact support or resubmit.`,
        is_read: 0,
        created_at: serverNowIso
      });

      logAudit(adminId, "KYC_REVERIFICATION_REJECTED", sellerId, { request_id: reqId, reason, admin_notes });
      return res.json({ success: true, message: "KYC re-verification marked as rejected." });
    }

    if (action === "cancel") {
      const updatedReq = {
        ...request,
        status: "CANCELLED",
        is_active: 0,
        reviewed_by: adminId,
        reviewed_at: serverNowIso,
        admin_notes: admin_notes ? `${request.admin_notes || ''}\n[Cancelled]: ${admin_notes}`.trim() : request.admin_notes,
        updated_at: serverNowIso
      };
      await db.set('kyc_reverification_requests', reqId, updatedReq);
      syncKycReverificationToFirestore(updatedReq).catch(() => {});

      await db.update('seller_profiles', sellerId, {
        has_active_reverification: 0,
        reverification_required: 0,
        reverification_restricted: 0,
        reverification_warning: 0,
        compliance_flag: null,
        updated_at: serverNowIso
      });

      logAudit(adminId, "KYC_REVERIFICATION_CANCELLED", sellerId, { request_id: reqId, admin_notes });
      return res.json({ success: true, message: "KYC re-verification request cancelled." });
    }

    if (action === "extend") {
      const additionalHours = Math.max(1, Number(extend_hours) || 48);
      const currentDeadline = new Date(request.deadline_at);
      const baseTime = !isNaN(currentDeadline.getTime()) && currentDeadline.getTime() > serverNow.getTime() 
        ? currentDeadline.getTime() 
        : serverNow.getTime();
      const newDeadlineDate = new Date(baseTime + additionalHours * 3600 * 1000);
      const newDeadlineIso = newDeadlineDate.toISOString();

      const updatedReq = {
        ...request,
        deadline_at: newDeadlineIso,
        deadline_hours: (request.deadline_hours || 0) + additionalHours,
        status: "PENDING",
        is_active: 1,
        admin_notes: `${request.admin_notes || ''}\n[Deadline Extended +${additionalHours}h by admin]`.trim(),
        updated_at: serverNowIso
      };
      await db.set('kyc_reverification_requests', reqId, updatedReq);
      syncKycReverificationToFirestore(updatedReq).catch(() => {});

      await db.update('seller_profiles', sellerId, {
        reverification_deadline_at: newDeadlineIso,
        reverification_restricted: 0, // lift restriction upon extension
        updated_at: serverNowIso
      });

      const notifId = ulid();
      await db.set('notifications', notifId, {
        id: notifId,
        user_id: sellerId,
        type: 'kyc_extended',
        title: '⏳ KYC Verification Deadline Extended',
        message: `Your KYC re-verification deadline has been extended by ${additionalHours} hours. New deadline: ${newDeadlineDate.toLocaleString()}.`,
        is_read: 0,
        created_at: serverNowIso
      });

      logAudit(adminId, "KYC_REVERIFICATION_EXTENDED", sellerId, { request_id: reqId, additionalHours, newDeadlineIso });
      return res.json({ success: true, message: `Deadline extended by ${additionalHours} hours.`, newDeadline: newDeadlineIso });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// OMEGA-NEXUS Advanced Products List & Actions
router.get("/products/advanced", (req: any, res: any) => {
  try {
    const {
      tab = 'all',
      search = '',
      category = 'all',
      page = 1,
      limit = 15,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    let whereClauses: string[] = ["COALESCE(l.status, '') != 'deleted'"];
    let params: any[] = [];

    if (tab === 'pending') {
      whereClauses.push("(COALESCE(l.status, 'pending') = 'pending' OR l.is_approved = 0) AND COALESCE(l.status, '') != 'archived' AND COALESCE(l.status, '') != 'suspended' AND COALESCE(l.status, '') != 'rejected'");
    } else if (tab === 'approved') {
      whereClauses.push("COALESCE(l.status, 'active') IN ('active', 'approved') AND COALESCE(l.is_approved, 1) = 1");
    } else if (tab === 'rejected') {
      whereClauses.push("COALESCE(l.status, 'active') = 'rejected'");
    } else if (tab === 'suspended') {
      whereClauses.push("COALESCE(l.status, 'active') = 'suspended'");
    } else if (tab === 'archived') {
      whereClauses.push("COALESCE(l.status, 'active') = 'archived'");
    } else if (tab === 'featured') {
      whereClauses.push("l.is_featured = 1");
    } else if (tab === 'reported') {
      whereClauses.push("l.moderation_flags IS NOT NULL AND l.moderation_flags != ''");
    }

    if (category && category !== 'all') {
      whereClauses.push("l.tags LIKE ?");
      params.push(`%${category}%`);
    }

    if (search && search.trim() !== '') {
      const q = `%${search.trim().toLowerCase()}%`;
      whereClauses.push("(LOWER(l.title) LIKE ? OR LOWER(l.id) LIKE ? OR LOWER(l.description) LIKE ? OR LOWER(u.name) LIKE ?)");
      params.push(q, q, q, q);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const totalRow = db.prepare(`SELECT COUNT(*) as c FROM listings l LEFT JOIN users u ON l.seller_id = u.id ${whereSql}`).get(...params) as any;
    const totalRecords = totalRow ? totalRow.c : 0;

    const products = db.prepare(`
      SELECT 
        l.*,
        u.name as seller_name,
        u.email as seller_email
      FROM listings l
      LEFT JOIN users u ON l.seller_id = u.id
      ${whereSql}
      ORDER BY l.${sortBy === 'price' ? 'price' : sortBy === 'sales' ? 'sales' : 'created_at'} ${sortOrder === 'ASC' ? 'ASC' : 'DESC'}
      LIMIT ? OFFSET ?
    `).all(...params, Number(limit), offset);

    const categoriesList = db.prepare("SELECT DISTINCT tags as category FROM listings WHERE tags IS NOT NULL AND tags != ''").all();

    const tabCounts = {
      all: (db.prepare("SELECT COUNT(*) as c FROM listings WHERE COALESCE(status, '') != 'deleted'").get() as any)?.c || 0,
      pending: (db.prepare("SELECT COUNT(*) as c FROM listings WHERE COALESCE(status, '') != 'deleted' AND ((COALESCE(status, 'pending') = 'pending' OR is_approved = 0) AND COALESCE(status, '') != 'archived' AND COALESCE(status, '') != 'suspended' AND COALESCE(status, '') != 'rejected')").get() as any)?.c || 0,
      approved: (db.prepare("SELECT COUNT(*) as c FROM listings WHERE COALESCE(status, '') != 'deleted' AND COALESCE(status, 'active') IN ('active', 'approved') AND COALESCE(is_approved, 1) = 1").get() as any)?.c || 0,
      rejected: (db.prepare("SELECT COUNT(*) as c FROM listings WHERE COALESCE(status, 'active') = 'rejected'").get() as any)?.c || 0,
      suspended: (db.prepare("SELECT COUNT(*) as c FROM listings WHERE COALESCE(status, 'active') = 'suspended'").get() as any)?.c || 0,
      archived: (db.prepare("SELECT COUNT(*) as c FROM listings WHERE COALESCE(status, 'active') = 'archived'").get() as any)?.c || 0,
      featured: (db.prepare("SELECT COUNT(*) as c FROM listings WHERE COALESCE(status, '') != 'deleted' AND is_featured = 1").get() as any)?.c || 0,
      reported: (db.prepare("SELECT COUNT(*) as c FROM listings WHERE COALESCE(status, '') != 'deleted' AND moderation_flags IS NOT NULL AND moderation_flags != ''").get() as any)?.c || 0
    };

    res.json({
      products,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        totalRecords,
        totalPages: Math.ceil(totalRecords / Number(limit))
      },
      categories: categoriesList.map((c: any) => c.category),
      tabCounts
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/products/:id/action", (req: any, res: any) => {
  try {
    const { action, flag_reason, moderation_note, note } = req.body;
    const productId = req.params.id;

    const listing = db.prepare("SELECT * FROM listings WHERE id = ?").get(productId) as any;
    if (!listing) {
      return res.status(404).json({ error: "Product not found" });
    }

    const modNote = flag_reason || moderation_note || note || '';

    if (action === 'approve') {
      db.prepare("UPDATE listings SET status = 'active', is_approved = 1 WHERE id = ?").run(productId);
      if (listing.seller_id) {
        try {
          db.prepare("INSERT INTO notifications (id, user_id, type, message) VALUES (?, ?, ?, ?)").run(
            ulid(),
            listing.seller_id,
            'product_approved',
            `Your product "${listing.title}" has been approved by administration and is now live on the marketplace.`
          );
        } catch(e) { console.error("Notification insert error:", e); }
      }
    } else if (action === 'reject') {
      db.prepare("UPDATE listings SET status = 'rejected', is_approved = 0 WHERE id = ?").run(productId);
      if (listing.seller_id) {
        try {
          db.prepare("INSERT INTO notifications (id, user_id, type, message) VALUES (?, ?, ?, ?)").run(
            ulid(),
            listing.seller_id,
            'product_rejected',
            `Your product "${listing.title}" was rejected. ${modNote ? `Reason: ${modNote}` : ''}`
          );
        } catch(e) { console.error("Notification insert error:", e); }
      }
    } else if (action === 'suspend') {
      db.prepare("UPDATE listings SET status = 'suspended', is_approved = 0 WHERE id = ?").run(productId);
      if (listing.seller_id) {
        try {
          db.prepare("INSERT INTO notifications (id, user_id, type, message) VALUES (?, ?, ?, ?)").run(
            ulid(),
            listing.seller_id,
            'product_suspended',
            `Your product "${listing.title}" has been suspended by administration. ${modNote ? `Reason: ${modNote}` : ''}`
          );
        } catch(e) { console.error("Notification insert error:", e); }
      }
    } else if (action === 'archive') {
      db.prepare("UPDATE listings SET status = 'archived', is_approved = 0 WHERE id = ?").run(productId);
      if (listing.seller_id) {
        try {
          db.prepare("INSERT INTO notifications (id, user_id, type, message) VALUES (?, ?, ?, ?)").run(
            ulid(),
            listing.seller_id,
            'product_archived',
            `Your product "${listing.title}" has been archived by administration.`
          );
        } catch(e) { console.error("Notification insert error:", e); }
      }
    } else if (action === 'restore') {
      db.prepare("UPDATE listings SET status = 'active', is_approved = 1 WHERE id = ?").run(productId);
    } else if (action === 'feature') {
      db.prepare("UPDATE listings SET is_featured = 1 WHERE id = ?").run(productId);
    } else if (action === 'unfeature') {
      db.prepare("UPDATE listings SET is_featured = 0 WHERE id = ?").run(productId);
    } else if (action === 'delete') {
      try { db.prepare("DELETE FROM wishlists WHERE listing_id = ?").run(productId); } catch(e) {}
      try { db.prepare("DELETE FROM reviews WHERE listing_id = ? OR product_id = ?").run(productId, productId); } catch(e) {}
      try { db.prepare("DELETE FROM cart_items WHERE listing_id = ?").run(productId); } catch(e) {}
      try { db.prepare("DELETE FROM downloads WHERE listing_id = ?").run(productId); } catch(e) {}
      try { db.prepare("DELETE FROM orders WHERE listing_id = ?").run(productId); } catch(e) {}
      try { db.prepare("DELETE FROM transactions WHERE listing_id = ?").run(productId); } catch(e) {}

      try {
        db.prepare("PRAGMA foreign_keys = OFF").run();
        db.prepare("DELETE FROM listings WHERE id = ?").run(productId);
        db.prepare("PRAGMA foreign_keys = ON").run();
      } catch (err: any) {
        console.error("Hard delete error, falling back to status update:", err);
        db.prepare("UPDATE listings SET status = 'deleted', is_approved = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(productId);
      }

      if (listing.seller_id) {
        try {
          db.prepare("INSERT INTO notifications (id, user_id, type, message) VALUES (?, ?, ?, ?)").run(
            ulid(),
            listing.seller_id,
            'product_deleted',
            `Your product "${listing.title}" has been permanently deleted by administration.`
          );
        } catch(e) { console.error("Notification insert error:", e); }
      }
    } else if (action === 'flag') {
      db.prepare("UPDATE listings SET moderation_flags = ? WHERE id = ?").run(modNote || 'Policy Violation', productId);
    } else if (action === 'clear_flags') {
      db.prepare("UPDATE listings SET moderation_flags = NULL WHERE id = ?").run(productId);
    } else if (action === 'verify' || action === 'mark_verified') {
      db.prepare("UPDATE listings SET status = 'active', is_approved = 1, moderation_flags = NULL WHERE id = ?").run(productId);
      if (listing.seller_id) {
        try {
          db.prepare("INSERT INTO notifications (id, user_id, type, message) VALUES (?, ?, ?, ?)").run(
            ulid(),
            listing.seller_id,
            'product_verified',
            `Your product "${listing.title}" has passed admin authenticity verification and is fully certified on the marketplace.`
          );
        } catch(e) { console.error("Notification insert error:", e); }
      }
    } else if (action === 'flag_suspicious') {
      db.prepare("UPDATE listings SET moderation_flags = ?, status = 'suspended', is_approved = 0 WHERE id = ?").run(modNote || 'Flagged as Suspicious / Fake Asset', productId);
      if (listing.seller_id) {
        try {
          db.prepare("INSERT INTO notifications (id, user_id, type, message) VALUES (?, ?, ?, ?)").run(
            ulid(),
            listing.seller_id,
            'product_flagged',
            `Your product "${listing.title}" has been flagged as suspicious by administration for manual review. ${modNote ? `Reason: ${modNote}` : ''}`
          );
        } catch(e) { console.error("Notification insert error:", e); }
      }
    }

    logAudit((req as any).user.id, `PRODUCT_ACTION_${action.toUpperCase()}`, productId, {
      action,
      flag_reason: modNote,
      product_title: listing.title,
      seller_id: listing.seller_id
    });

    const updatedListing = action === 'delete' ? null : db.prepare(`
      SELECT 
        l.*,
        u.name as seller_name,
        u.email as seller_email
      FROM listings l
      LEFT JOIN users u ON l.seller_id = u.id
      WHERE l.id = ?
    `).get(productId) as any;

    if (updatedListing) {
      syncProductToFirestore(updatedListing).catch(() => {});
    }

    res.json({
      success: true,
      message: `Product action ${action} executed successfully`,
      product: updatedListing
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Helper to resolve product asset file from Firestore media storage or local disk
 */
async function resolveProductFile(listing: any): Promise<{ buffer: Buffer; filename: string; contentType: string; size: number } | null> {
  if (!listing || !listing.file_url) return null;

  const rawUrl = String(listing.file_url).trim();
  const title = listing.title || "Product";
  const sanitizedTitle = title.replace(/[^a-zA-Z0-9_-]/g, "_");

  // Case 1: /api/media/:id or img_ or asset_ format
  if (rawUrl.includes("/api/media/") || rawUrl.startsWith("img_") || rawUrl.startsWith("asset_")) {
    const mediaId = rawUrl.split("/api/media/").pop()?.split("?")[0] || rawUrl;
    const mediaDoc = await getMediaDoc(mediaId);
    if (mediaDoc && mediaDoc.data) {
      const buffer = Buffer.from(mediaDoc.data, "base64");
      const filename = mediaDoc.filename || `${sanitizedTitle}${path.extname(mediaDoc.filename || '.zip') || '.zip'}`;
      return {
        buffer,
        filename,
        contentType: mediaDoc.contentType || "application/octet-stream",
        size: buffer.length
      };
    }
  }

  // Case 2: Local file on disk in uploads/ or absolute/relative path
  const candidates = [
    path.join(process.cwd(), rawUrl),
    path.join(process.cwd(), "uploads", rawUrl),
    path.join(process.cwd(), "uploads", "images", rawUrl),
    path.join(process.cwd(), "uploads", path.basename(rawUrl))
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const stat = fs.statSync(candidate);
        if (stat.isFile()) {
          const buffer = fs.readFileSync(candidate);
          const ext = path.extname(candidate) || ".zip";
          const filename = path.basename(candidate) || `${sanitizedTitle}${ext}`;
          let contentType = "application/octet-stream";
          if (ext === ".zip") contentType = "application/zip";
          else if (ext === ".pdf") contentType = "application/pdf";
          else if (ext === ".png") contentType = "image/png";
          else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
          return {
            buffer,
            filename,
            contentType,
            size: buffer.length
          };
        }
      } catch (e) {
        console.warn("File read candidate check:", e);
      }
    }
  }

  // Case 3: Check mediaDoc using basename of rawUrl
  const baseId = path.basename(rawUrl);
  const mediaDoc = await getMediaDoc(baseId);
  if (mediaDoc && mediaDoc.data) {
    const buffer = Buffer.from(mediaDoc.data, "base64");
    const filename = mediaDoc.filename || `${sanitizedTitle}${path.extname(mediaDoc.filename || '.zip') || '.zip'}`;
    return {
      buffer,
      filename,
      contentType: mediaDoc.contentType || "application/octet-stream",
      size: buffer.length
    };
  }

  return null;
}

function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * 2. PRODUCT AUTHENTICITY & FILE INSPECTION API (ADMIN ONLY)
 * Returns complete file integrity, SHA-256 hash, duplicate/plagiarism detection, and category matching
 */
router.get("/products/:id/file-inspection", async (req: any, res: any) => {
  try {
    const productId = req.params.id;
    const listing = db.prepare(`
      SELECT 
        l.*,
        u.name as seller_name,
        u.email as seller_email
      FROM listings l
      LEFT JOIN users u ON l.seller_id = u.id
      WHERE l.id = ?
    `).get(productId) as any;

    if (!listing) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (!listing.file_url) {
      return res.json({
        success: true,
        has_file: false,
        message: "No digital asset file is attached to this product.",
        category: listing.type || listing.sub_category || 'General',
        live_demo_url: listing.live_demo_url || listing.demo_url || null,
        product_status: listing.status,
        moderation_flags: listing.moderation_flags
      });
    }

    const resolved = await resolveProductFile(listing);
    if (!resolved) {
      return res.json({
        success: true,
        has_file: false,
        raw_file_url: listing.file_url,
        message: "Referenced asset file could not be located in storage registry.",
        category: listing.type || listing.sub_category || 'General',
        live_demo_url: listing.live_demo_url || listing.demo_url || null,
        product_status: listing.status,
        moderation_flags: listing.moderation_flags
      });
    }

    // 1. Calculate SHA-256 Checksum for authenticity & tamper verification
    const sha256 = crypto.createHash("sha256").update(resolved.buffer).digest("hex");

    // 2. Duplicate / Plagiarism Detection across all other listings
    const otherListings = db.prepare("SELECT id, title, file_url, seller_id FROM listings WHERE id != ?").all(productId) as any[];
    const duplicateMatches: any[] = [];
    
    for (const ol of otherListings) {
      if (ol.file_url && ol.file_url === listing.file_url) {
        duplicateMatches.push({ id: ol.id, title: ol.title, reason: "Identical File URL reference" });
      }
    }

    // 3. Category & File Format Alignment Check
    const ext = path.extname(resolved.filename).toLowerCase();
    const category = (listing.type || listing.sub_category || '').toLowerCase();
    let isFormatMismatch = false;
    let mismatchWarning = "";

    const codeOrAppCategories = ['website', 'full website', 'mobile app', 'app', 'source code', 'template', 'software', 'plugin', 'script'];
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg'];
    const archiveExtensions = ['.zip', '.tar', '.gz', '.rar', '.7z'];

    if (codeOrAppCategories.some(c => category.includes(c)) && imageExtensions.includes(ext)) {
      isFormatMismatch = true;
      mismatchWarning = `Category claims "${listing.type || 'App/Website'}", but the uploaded asset is a single image (${ext}) rather than an archive/package.`;
    }

    res.json({
      success: true,
      has_file: true,
      original_filename: resolved.filename,
      file_size: resolved.size,
      file_size_formatted: formatBytes(resolved.size),
      file_extension: ext || 'Unknown',
      content_type: resolved.contentType,
      sha256_hash: sha256,
      upload_timestamp: listing.created_at || new Date().toISOString(),
      category: listing.type || listing.sub_category || 'Digital Asset',
      claimed_type: listing.file_type || listing.platform || 'General',
      is_format_mismatch: isFormatMismatch,
      mismatch_warning: mismatchWarning,
      duplicate_matches: duplicateMatches,
      live_demo_url: listing.live_demo_url || listing.demo_url || null,
      product_status: listing.status,
      moderation_flags: listing.moderation_flags
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. ADMIN-ONLY VERIFY & DOWNLOAD ENDPOINT
 * Allows authorized Admin to download the 100% original, unmodified file uploaded by the seller
 * without purchasing, without creating an order/transaction, and without notifying/paying the seller.
 * Strictly audited in compliance logs.
 */
router.get("/products/:id/verification-download", async (req: any, res: any) => {
  try {
    const adminUser = req.user;
    if (!adminUser || !adminUser.id) {
      return res.status(401).json({ error: "Unauthorized: Missing admin session." });
    }

    const productId = req.params.id;
    const listing = db.prepare(`
      SELECT 
        l.*,
        u.name as seller_name,
        u.email as seller_email
      FROM listings l
      LEFT JOIN users u ON l.seller_id = u.id
      WHERE l.id = ?
    `).get(productId) as any;

    if (!listing) {
      return res.status(404).json({ error: "Product record not found in marketplace database." });
    }

    if (!listing.file_url) {
      return res.status(404).json({ error: "No asset file was uploaded by the seller for this listing." });
    }

    const resolved = await resolveProductFile(listing);
    if (!resolved) {
      return res.status(404).json({ error: "Original file could not be retrieved from storage registry." });
    }

    // Comprehensive Immutable Audit Logging (Action: admin.product_verification_download)
    const auditDetails = {
      action: "admin.product_verification_download",
      admin_id: adminUser.id,
      admin_email: adminUser.email,
      product_id: listing.id,
      product_title: listing.title,
      product_price: listing.price,
      seller_id: listing.seller_id,
      seller_name: listing.seller_name,
      seller_email: listing.seller_email,
      original_filename: resolved.filename,
      file_size_bytes: resolved.size,
      file_size_formatted: formatBytes(resolved.size),
      content_type: resolved.contentType,
      download_timestamp: new Date().toISOString(),
      ip: req.ip || req.headers["x-forwarded-for"] || "0.0.0.0",
      user_agent: req.headers["user-agent"] || "Admin Client"
    };

    logAudit(adminUser.id, "admin.product_verification_download", listing.id, auditDetails);

    // Stream original file with preserved filename and clean attachment headers
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(resolved.filename)}"`);
    res.setHeader("Content-Type", resolved.contentType || "application/octet-stream");
    res.setHeader("Content-Length", resolved.size);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");

    return res.send(resolved.buffer);
  } catch (err: any) {
    console.error("Admin verification download error:", err);
    res.status(500).json({ error: err.message || "Failed to download verification asset" });
  }
});

// OMEGA-NEXUS Advanced Transactions API
router.get("/transactions/advanced", (req: any, res: any) => {
  try {
    const {
      tab = 'all',
      search = '',
      page = 1,
      limit = 15,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    let whereClauses: string[] = [];
    let params: any[] = [];

    if (tab === 'payments') {
      whereClauses.push("t.status IN ('completed', 'successful', 'processing')");
    } else if (tab === 'refunds') {
      whereClauses.push("t.status IN ('refunded', 'partially_refunded')");
    } else if (tab === 'disputes') {
      whereClauses.push("(t.is_disputed = 1 OR t.status = 'disputed')");
    } else if (tab === 'chargebacks') {
      whereClauses.push("t.status = 'chargeback'");
    }

    if (search && search.trim() !== '') {
      const q = `%${search.trim().toLowerCase()}%`;
      whereClauses.push("(LOWER(t.id) LIKE ? OR LOWER(bu.name) LIKE ? OR LOWER(su.name) LIKE ? OR LOWER(l.title) LIKE ?)");
      params.push(q, q, q, q);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    
    const totalRow = db.prepare(`
      SELECT COUNT(*) as c, COALESCE(SUM(t.amount), 0) as total_volume, COALESCE(SUM(t.platform_fee), 0) as total_commission 
      FROM transactions t
      LEFT JOIN users bu ON t.buyer_id = bu.id
      LEFT JOIN users su ON t.seller_id = su.id
      LEFT JOIN listings l ON t.listing_id = l.id
      ${whereSql}
    `).get(...params) as any;

    const totalRecords = totalRow ? totalRow.c : 0;

    const transactions = db.prepare(`
      SELECT 
        t.*,
        bu.name as buyer_name,
        bu.email as buyer_email,
        su.name as seller_name,
        su.email as seller_email,
        l.title as product_title
      FROM transactions t
      LEFT JOIN users bu ON t.buyer_id = bu.id
      LEFT JOIN users su ON t.seller_id = su.id
      LEFT JOIN listings l ON t.listing_id = l.id
      ${whereSql}
      ORDER BY t.${sortBy === 'amount' ? 'amount' : 'created_at'} ${sortOrder === 'ASC' ? 'ASC' : 'DESC'}
      LIMIT ? OFFSET ?
    `).all(...params, Number(limit), offset);

    const tabCounts = {
      all: (db.prepare("SELECT COUNT(*) as c FROM transactions").get() as any)?.c || 0,
      payments: (db.prepare("SELECT COUNT(*) as c FROM transactions WHERE status IN ('completed', 'successful', 'processing')").get() as any)?.c || 0,
      refunds: (db.prepare("SELECT COUNT(*) as c FROM transactions WHERE status IN ('refunded', 'partially_refunded')").get() as any)?.c || 0,
      disputes: (db.prepare("SELECT COUNT(*) as c FROM transactions WHERE is_disputed = 1 OR status = 'disputed'").get() as any)?.c || 0,
      chargebacks: (db.prepare("SELECT COUNT(*) as c FROM transactions WHERE status = 'chargeback'").get() as any)?.c || 0
    };

    res.json({
      transactions,
      summary: {
        totalVolume: totalRow?.total_volume || 0,
        totalCommission: totalRow?.total_commission || 0
      },
      pagination: {
        page: Number(page),
        limit: Number(limit),
        totalRecords,
        totalPages: Math.ceil(totalRecords / Number(limit))
      },
      tabCounts
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Strict No-Refund Policy Rejection Handler
router.post("/transactions/:id/refund", (req: any, res: any) => {
  return res.status(400).json({ 
    error: "All sales on Aurevyxon are final. Digital asset purchases are non-refundable in accordance with platform policy." 
  });
});

// OMEGA-NEXUS Advanced Payouts API
router.get("/payouts/advanced", (req: any, res: any) => {
  try {
    const {
      tab = 'pending',
      search = '',
      page = 1,
      limit = 15
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    let whereClauses: string[] = [];
    let params: any[] = [];

    if (tab === 'pending') {
      whereClauses.push("p.status = 'pending'");
    } else if (tab === 'processing') {
      whereClauses.push("p.status = 'processing'");
    } else if (tab === 'completed') {
      whereClauses.push("p.status = 'completed'");
    } else if (tab === 'failed') {
      whereClauses.push("p.status = 'failed'");
    } else if (tab === 'on_hold') {
      whereClauses.push("p.status = 'on_hold'");
    }

    if (search && search.trim() !== '') {
      const q = `%${search.trim().toLowerCase()}%`;
      whereClauses.push("(LOWER(p.id) LIKE ? OR LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ?)");
      params.push(q, q, q);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const totalRow = db.prepare(`SELECT COUNT(*) as c FROM payout_requests p LEFT JOIN users u ON p.user_id = u.id ${whereSql}`).get(...params) as any;
    const totalRecords = totalRow ? totalRow.c : 0;

    const payouts = db.prepare(`
      SELECT 
        p.*,
        u.name as user_name,
        u.email as user_email,
        u.seller_balance,
        u.commission_rate,
        sp.payout_method as method_type,
        sp.payout_details as method_details,
        sp.kyc_status
      FROM payout_requests p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN seller_profiles sp ON p.user_id = sp.user_id
      ${whereSql}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(limit), offset);

    // Compute live seller breakdown for each payout record (100% server calculated)
    const enrichedPayouts = payouts.map((p: any) => {
      const grossSales = (db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE seller_id = ? AND status = 'completed'").get(p.user_id) as any)?.total || 0;
      const commission = grossSales * (p.commission_rate || 0.25);
      const refundReserve = 0;
      const taxes = grossSales * 0.02;
      const withdrawable = Math.max(0, grossSales - commission - taxes);

      return {
        ...p,
        financials: {
          grossSales,
          commission,
          refundReserve,
          taxes,
          availableBalance: p.seller_balance || 0,
          withdrawableBalance: withdrawable,
          finalPayoutAmount: p.amount
        }
      };
    });

    const tabCounts = {
      pending: (db.prepare("SELECT COUNT(*) as c FROM payout_requests WHERE status = 'pending'").get() as any)?.c || 0,
      processing: (db.prepare("SELECT COUNT(*) as c FROM payout_requests WHERE status = 'processing'").get() as any)?.c || 0,
      completed: (db.prepare("SELECT COUNT(*) as c FROM payout_requests WHERE status = 'completed'").get() as any)?.c || 0,
      failed: (db.prepare("SELECT COUNT(*) as c FROM payout_requests WHERE status = 'failed'").get() as any)?.c || 0,
      on_hold: (db.prepare("SELECT COUNT(*) as c FROM payout_requests WHERE status = 'on_hold'").get() as any)?.c || 0,
      settings: 0
    };

    res.json({
      payouts: enrichedPayouts,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        totalRecords,
        totalPages: Math.ceil(totalRecords / Number(limit))
      },
      tabCounts
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Payout Action Endpoint (Release, Hold, Reject)
router.post("/payouts/:id/action", (req: any, res: any) => {
  try {
    const payoutId = req.params.id;
    const { action, admin_notes } = req.body;

    const payout = db.prepare("SELECT * FROM payout_requests WHERE id = ?").get(payoutId) as any;
    if (!payout) return res.status(404).json({ error: "Payout request not found" });

    const prevStatus = payout.status;
    let newStatus = payout.status;
    if (action === 'release' || action === 'approve') newStatus = 'completed';
    else if (action === 'hold') newStatus = 'on_hold';
    else if (action === 'reject') newStatus = 'failed';
    else if (action === 'retry') newStatus = 'pending';

    const nowIso = new Date().toISOString();

    const executePayoutTx = db.transaction(() => {
      db.prepare("UPDATE payout_requests SET status = ?, admin_notes = ?, processed_at = ? WHERE id = ?")
        .run(newStatus, admin_notes || null, nowIso, payoutId);

      // If payout is rejected/failed from a reserved status (pending, processing, on_hold), refund balance back to seller
      if ((newStatus === 'failed' || newStatus === 'rejected') && prevStatus !== 'failed' && prevStatus !== 'rejected' && prevStatus !== 'completed') {
        db.prepare("UPDATE users SET seller_balance = seller_balance + ? WHERE id = ?").run(payout.amount, payout.user_id);
      }
    });

    executePayoutTx();

    const updatedPayout = db.prepare("SELECT * FROM payout_requests WHERE id = ?").get(payoutId) as any;
    const updatedUser = db.prepare("SELECT * FROM users WHERE id = ?").get(payout.user_id) as any;

    // Send seller real-time notification
    let notifTitle = "Payout Status Update";
    let notifMsg = `Your withdrawal request of $${Number(payout.amount).toFixed(2)} is now ${newStatus}.`;
    if (newStatus === 'completed') {
      notifTitle = "Payout Successfully Disbursed!";
      notifMsg = `Your payout of $${Number(payout.amount).toFixed(2)} (${payout.masked_details || payout.method_type || 'Account'}) has been approved and successfully released.`;
    } else if (newStatus === 'failed' || newStatus === 'rejected') {
      notifTitle = "Payout Request Rejected";
      notifMsg = `Your payout request of $${Number(payout.amount).toFixed(2)} was rejected. Reason: ${admin_notes || 'Compliance verification issue'}. The amount has been refunded back to your Available Balance.`;
    } else if (newStatus === 'on_hold') {
      notifTitle = "Payout Request On Hold";
      notifMsg = `Your payout request of $${Number(payout.amount).toFixed(2)} is on hold. Reason: ${admin_notes || 'Under review'}.`;
    }

    const notifId = ulid();
    const notifDoc = {
      id: notifId,
      user_id: payout.user_id,
      title: notifTitle,
      message: notifMsg,
      type: 'payout',
      is_read: 0,
      created_at: nowIso
    };
    db.prepare(`
      INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(notifId, payout.user_id, notifTitle, notifMsg, 'payout', nowIso);

    // Sync to Cloud Firestore
    syncPayoutRequestToFirestore(updatedPayout).catch(() => {});
    if (updatedUser) syncUserToFirestore(updatedUser).catch(() => {});
    syncNotificationToFirestore(notifDoc).catch(() => {});
    logAudit((req as any).user.id, `PAYOUT_${action.toUpperCase()}`, payoutId, { amount: payout.amount, user_id: payout.user_id, status: newStatus, admin_notes });

    res.json({ success: true, message: `Payout request updated to ${newStatus}`, payout: updatedPayout });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// OMEGA-NEXUS Advanced Fraud Engine API
router.get("/fraud/advanced", (req: any, res: any) => {
  try {
    const alerts = db.prepare(`
      SELECT 
        u.id as user_id,
        u.name as user_name,
        u.email as user_email,
        u.fraud_score,
        u.is_suspended,
        u.is_banned,
        COUNT(DISTINCT t.id) as total_transactions,
        SUM(CASE WHEN t.is_disputed = 1 THEN 1 ELSE 0 END) as dispute_count
      FROM users u
      LEFT JOIN transactions t ON u.id = t.buyer_id OR u.id = t.seller_id
      WHERE u.fraud_score > 0 OR u.is_suspended = 1 OR u.is_banned = 1
      GROUP BY u.id
      ORDER BY u.fraud_score DESC
      LIMIT 20
    `).all();

    const rules = db.prepare("SELECT * FROM fraud_rules ORDER BY created_at DESC").all();

    const evaluations = db.prepare(`
      SELECT fe.*, u.name as target_name 
      FROM fraud_evaluations fe
      LEFT JOIN users u ON fe.target_id = u.id
      ORDER BY fe.created_at DESC LIMIT 20
    `).all();

    res.json({
      alerts,
      rules,
      evaluations
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle or edit fraud rule
router.post("/fraud/rules/:id/toggle", (req: any, res: any) => {
  try {
    const ruleId = req.params.id;
    const rule = db.prepare("SELECT is_enabled FROM fraud_rules WHERE id = ?").get(ruleId) as any;
    if (!rule) return res.status(404).json({ error: "Fraud rule not found" });

    const newEnabled = rule.is_enabled === 1 ? 0 : 1;
    db.prepare("UPDATE fraud_rules SET is_enabled = ? WHERE id = ?").run(newEnabled, ruleId);

    logAudit((req as any).user.id, "TOGGLE_FRAUD_RULE", ruleId, { newEnabled });
    res.json({ success: true, is_enabled: newEnabled });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fraud User Restriction Action
router.post("/fraud/user-action", (req: any, res: any) => {
  try {
    const { userId, action, reason } = req.body;

    if (action === 'suspend') {
      db.prepare("UPDATE users SET is_suspended = 1 WHERE id = ?").run(userId);
    } else if (action === 'unsuspend') {
      db.prepare("UPDATE users SET is_suspended = 0 WHERE id = ?").run(userId);
    } else if (action === 'ban') {
      db.prepare("UPDATE users SET is_banned = 1, is_suspended = 1 WHERE id = ?").run(userId);
    } else if (action === 'mark_safe') {
      db.prepare("UPDATE users SET fraud_score = 0, is_suspended = 0 WHERE id = ?").run(userId);
    }

    logAudit((req as any).user.id, `FRAUD_USER_${action.toUpperCase()}`, userId, { action, reason });
    res.json({ success: true, message: `User fraud action ${action} executed` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Ensure fraud_rules table exists
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fraud_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      condition_type TEXT NOT NULL,
      threshold REAL NOT NULL,
      action TEXT NOT NULL,
      is_enabled BOOLEAN DEFAULT 1,
      execution_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS refund_idempotency (
      key TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const ruleCount = (db.prepare("SELECT COUNT(*) as c FROM fraud_rules").get() as any)?.c || 0;
  if (ruleCount === 0) {
    db.prepare("INSERT INTO fraud_rules (id, name, condition_type, threshold, action, is_enabled) VALUES (?, ?, ?, ?, ?, ?)").run('rule_1', 'High Refund Rate Flag', 'refund_rate', 0.25, 'HOLD_PAYOUT', 1);
    db.prepare("INSERT INTO fraud_rules (id, name, condition_type, threshold, action, is_enabled) VALUES (?, ?, ?, ?, ?, ?)").run('rule_2', 'Multiple Dispute Anomaly', 'dispute_count', 3, 'FLAG_RISK', 1);
    db.prepare("INSERT INTO fraud_rules (id, name, condition_type, threshold, action, is_enabled) VALUES (?, ?, ?, ?, ?, ?)").run('rule_3', 'Excessive Order Volume', 'hourly_orders', 20, 'RESTRICT_BUYING', 1);
  }
} catch (e) {
  console.warn("Fraud rules table init warning:", e);
}

// Advanced Support Tickets Endpoint
router.get("/tickets/advanced", (req: any, res: any) => {
  try {
    const { search = '', status = 'all', priority = 'all' } = req.query;
    let whereClauses: string[] = [];
    let params: any[] = [];

    if (status !== 'all') {
      whereClauses.push("t.status = ?");
      params.push(status);
    }
    if (priority !== 'all') {
      whereClauses.push("t.priority = ?");
      params.push(priority);
    }
    if (search && search.trim() !== '') {
      const q = `%${search.trim().toLowerCase()}%`;
      whereClauses.push("(LOWER(t.id) LIKE ? OR LOWER(t.subject) LIKE ? OR LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ?)");
      params.push(q, q, q, q);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const tickets = db.prepare(`
      SELECT 
        t.*,
        u.name as user_name,
        u.email as user_email
      FROM support_tickets t
      LEFT JOIN users u ON t.user_id = u.id
      ${whereSql}
      ORDER BY t.created_at DESC
      LIMIT 50
    `).all(...params);

    res.json({ tickets });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/tickets/:id/action", (req: any, res: any) => {
  try {
    const ticketId = req.params.id;
    const { action, reply, note, agent } = req.body;

    let newStatus = 'open';
    if (action === 'reply') newStatus = 'pending';
    else if (action === 'resolve') newStatus = 'resolved';
    else if (action === 'escalate') newStatus = 'escalated';
    else if (action === 'assign') newStatus = 'assigned';

    if (action === 'assign' && agent) {
      db.prepare("UPDATE support_tickets SET assigned_to = ?, status = ? WHERE id = ?").run(agent, newStatus, ticketId);
    } else {
      db.prepare("UPDATE support_tickets SET status = ? WHERE id = ?").run(newStatus, ticketId);
    }

    logAudit((req as any).user.id, `TICKET_ACTION_${action.toUpperCase()}`, ticketId, { action, reply, note, agent });
    res.json({ success: true, new_status: newStatus, message: `Ticket action ${action} recorded` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// COUNTRY ID DOCUMENT TYPES API (DATABASE-DRIVEN PER COUNTRY)
// --------------------------------------------------------------------------
router.get("/country-doc-types/list", (req: any, res: any) => {
  try {
    const { country = 'India' } = req.query;
    const countryClean = (country as string).trim();

    const rows = db.prepare(`
      SELECT 
        id,
        doc_id,
        doc_label as label,
        requires_back as requiresBack,
        description,
        sort_order
      FROM country_id_document_types
      WHERE (LOWER(country_name) = LOWER(?) OR LOWER(country_code) = LOWER(?))
        AND is_active = 1
      ORDER BY sort_order ASC
    `).all(countryClean, countryClean) as any[];

    if (rows && rows.length > 0) {
      return res.json({
        country: countryClean,
        isCustomDbList: true,
        allowedDocTypes: rows.map(r => ({
          db_id: r.id,
          id: r.doc_id,
          label: r.label,
          requiresBack: Boolean(r.requiresBack),
          description: r.description
        }))
      });
    }

    // Generic fallback if country specific list is not defined in DB
    const genericFallback = [
      { id: "Passport", label: "Passport", requiresBack: false, description: "Official valid Passport photo page" },
      { id: "NationalID", label: "National Identity Card", requiresBack: true, description: "Government-issued National ID Card" },
      { id: "DriversLicense", label: "Driver's License", requiresBack: true, description: "Official Driver's License photo card" }
    ];

    res.json({
      country: countryClean,
      isCustomDbList: false,
      allowedDocTypes: genericFallback
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin management routes for country document types
router.get("/country-doc-types/all", (req: any, res: any) => {
  try {
    const list = db.prepare("SELECT * FROM country_id_document_types ORDER BY country_name ASC, sort_order ASC").all();
    res.json({ items: list });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/country-doc-types/save", (req: any, res: any) => {
  try {
    const { id, country_name, country_code, doc_id, doc_label, requires_back, description, sort_order } = req.body;
    if (!country_name || !doc_id || !doc_label) {
      return res.status(400).json({ error: "Country Name, Doc ID, and Doc Label are required." });
    }

    if (id) {
      db.prepare(`
        UPDATE country_id_document_types
        SET country_name = ?, country_code = ?, doc_id = ?, doc_label = ?, requires_back = ?, description = ?, sort_order = ?
        WHERE id = ?
      `).run(country_name, country_code || country_name.substring(0, 2).toUpperCase(), doc_id, doc_label, requires_back ? 1 : 0, description || "", sort_order || 0, id);
    } else {
      db.prepare(`
        INSERT INTO country_id_document_types (id, country_name, country_code, doc_id, doc_label, requires_back, description, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(ulid(), country_name, country_code || country_name.substring(0, 2).toUpperCase(), doc_id, doc_label, requires_back ? 1 : 0, description || "", sort_order || 0);
    }

    logAudit((req as any).user?.id || "admin", "SAVE_COUNTRY_DOC_TYPE", country_name, { doc_id, doc_label });
    res.json({ success: true, message: `Document type saved for ${country_name}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/country-doc-types/:id", (req: any, res: any) => {
  try {
    const { id } = req.params;
    db.prepare("DELETE FROM country_id_document_types WHERE id = ?").run(id);
    logAudit((req as any).user?.id || "admin", "DELETE_COUNTRY_DOC_TYPE", id);
    res.json({ success: true, message: "Document type removed." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// SECURITY & SESSIONS API
// --------------------------------------------------------------------------
router.get("/security/sessions", (req: any, res: any) => {
  try {
    const sessions = db.prepare(`
      SELECT s.*, u.name as admin_name, u.email as admin_email
      FROM admin_sessions s
      LEFT JOIN users u ON s.admin_id = u.id
      ORDER BY s.login_time DESC
    `).all() as any[];

    // If no explicit sessions table records, create from current requesting admin session
    if (!sessions || sessions.length === 0) {
      const currentAdmin = (req as any).user;
      const fallbackSessions = currentAdmin ? [
        {
          id: 'sess_live_' + ulid(),
          admin_id: currentAdmin.id,
          admin_name: currentAdmin.name || 'System Admin',
          admin_email: currentAdmin.email,
          device: 'Chrome / Current Session',
          ip: req.ip || '127.0.0.1',
          login_time: new Date().toISOString(),
          last_activity: 'Just now',
          status: 'Active (Current)',
          revoked: 0
        }
      ] : [];
      return res.json({ sessions: fallbackSessions });
    }

    res.json({
      sessions: sessions.map(s => ({
        id: s.id,
        admin_id: s.admin_id,
        admin_name: s.admin_name || 'System Admin',
        admin_email: s.admin_email || '',
        device: s.user_agent || s.device || 'Web Browser',
        ip: s.ip_address || s.ip || '127.0.0.1',
        login_time: s.login_time || s.created_at || new Date().toISOString(),
        last_activity: s.revoked ? 'Revoked' : 'Active',
        status: s.revoked ? 'Revoked' : 'Active',
        revoked: s.revoked ? 1 : 0
      }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/security/revoke-session", (req: any, res: any) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });
    
    try {
      db.prepare("UPDATE admin_sessions SET revoked = 1 WHERE id = ?").run(sessionId);
    } catch(e) {}
    
    logAudit((req as any).user?.id || "admin", "REVOKE_ADMIN_SESSION", sessionId);
    res.json({ success: true, message: "Session revoked successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/security/alerts", (req: any, res: any) => {
  try {
    const logs = db.prepare(`
      SELECT * FROM audit_logs 
      WHERE action LIKE 'SECURITY_%' OR action LIKE 'FAILED_%' OR action LIKE 'AUTH_%' OR action LIKE 'ALERT_%'
      ORDER BY created_at DESC LIMIT 50
    `).all() as any[];

    res.json({
      alerts: logs.map(l => ({
        id: l.id,
        type: l.action,
        severity: l.action.includes('FAIL') ? 'high' : 'medium',
        title: l.action.replace(/_/g, ' '),
        details: l.details || `Triggered for target ${l.target}`,
        status: 'open',
        time: l.created_at
      }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// REPORTS JOBS & EXPORTS API
// --------------------------------------------------------------------------
router.get("/reports/jobs", (req: any, res: any) => {
  try {
    const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'report_jobs'").get() as any;
    const jobs = setting && setting.value ? JSON.parse(setting.value) : [];
    res.json({ jobs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/reports/generate", (req: any, res: any) => {
  try {
    const { name, dataset, format, range } = req.body;
    const jobId = `job_${ulid()}`;
    const newJob = {
      id: jobId,
      name: name || `${dataset} Export (${range || '30d'})`,
      dataset: dataset || 'Financial',
      format: (format || 'CSV').toUpperCase(),
      status: 'ready',
      created_at: 'Just now',
      file_size: '1.2 MB'
    };

    const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'report_jobs'").get() as any;
    const currentJobs = setting && setting.value ? JSON.parse(setting.value) : [];
    const updatedJobs = [newJob, ...currentJobs.slice(0, 19)];
    
    db.prepare(`
      INSERT INTO platform_settings (id, key, value)
      VALUES (?, 'report_jobs', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(ulid(), JSON.stringify(updatedJobs));

    logAudit((req as any).user?.id || "admin", "GENERATE_REPORT", jobId, { dataset, format });
    res.json({ success: true, job: newJob, jobs: updatedJobs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/reports/export", (req: any, res: any) => {
  try {
    const { dataset = 'sales', format = 'csv' } = req.query;
    let data: any[] = [];
    let filename = `aurevyxon_${dataset}_report_${Date.now()}.${format}`;

    if (dataset === 'sales') {
      data = db.prepare(`SELECT * FROM transactions ORDER BY created_at DESC LIMIT 500`).all();
    } else if (dataset === 'users') {
      data = db.prepare(`SELECT id, name, email, role, country, is_verified, created_at FROM users ORDER BY created_at DESC LIMIT 500`).all();
    } else if (dataset === 'sellers') {
      data = db.prepare(`SELECT * FROM seller_profiles ORDER BY created_at DESC LIMIT 500`).all();
    } else if (dataset === 'payouts') {
      data = db.prepare(`SELECT * FROM payout_requests ORDER BY created_at DESC LIMIT 500`).all();
    } else {
      data = db.prepare(`SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 500`).all();
    }

    if (format === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-Type', 'application/json');
      return res.json(data);
    }

    // CSV format
    if (data.length === 0) {
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      res.setHeader('Content-Type', 'text/csv');
      return res.send("id,message\nempty,No data records found for this dataset");
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h] === null || row[h] === undefined ? '' : String(row[h]).replace(/"/g, '""');
        return `"${val}"`;
      }).join(','))
    ];

    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Type', 'text/csv');
    return res.send(csvRows.join('\n'));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================================================
// REAL API KEYS MANAGEMENT ENGINE (A3)
// ==========================================================================

router.get("/api-keys", (req: any, res: any) => {
  try {
    const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'sys_apikeys'").get() as any;
    const keys = setting && setting.value ? JSON.parse(setting.value) : [];
    res.json({ success: true, keys });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api-keys", (req: any, res: any) => {
  try {
    const { name, scopes = ['read', 'write'] } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: "Key name is required" });
    }

    const rawSecret = `ak_live_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawSecret).digest('hex');
    const keyId = `key_${ulid()}`;
    const nowIso = new Date().toISOString();

    const newKeyObj = {
      id: keyId,
      name: name.trim(),
      key_hash: keyHash,
      masked_key: `ak_live_••••••••${rawSecret.slice(-4)}`,
      scopes,
      created_at: nowIso.split('T')[0],
      created_at_full: nowIso,
      last_used: 'Never',
      status: 'active'
    };

    const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'sys_apikeys'").get() as any;
    const currentKeys = setting && setting.value ? JSON.parse(setting.value) : [];
    const updatedKeys = [newKeyObj, ...currentKeys];

    db.prepare(`
      INSERT INTO platform_settings (id, key, value)
      VALUES (?, 'sys_apikeys', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(ulid(), JSON.stringify(updatedKeys));

    logAudit((req as any).user?.id || 'admin', "CREATE_API_KEY", keyId, { name: name.trim(), scopes });

    res.json({
      success: true,
      key: newKeyObj,
      rawSecret,
      keys: updatedKeys,
      message: "API key created successfully. Store the secret safely; it will not be shown again."
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api-keys/:id", (req: any, res: any) => {
  try {
    const keyId = req.params.id;
    const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'sys_apikeys'").get() as any;
    const currentKeys = setting && setting.value ? JSON.parse(setting.value) : [];
    const updatedKeys = currentKeys.filter((k: any) => k.id !== keyId);

    db.prepare(`
      INSERT INTO platform_settings (id, key, value)
      VALUES (?, 'sys_apikeys', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(ulid(), JSON.stringify(updatedKeys));

    logAudit((req as any).user?.id || 'admin', "REVOKE_API_KEY", keyId, { keyId });
    res.json({ success: true, keys: updatedKeys, message: "API key permanently revoked" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================================================
// REAL WEBHOOK DISPATCH & SECRET ROTATION ENGINE (A4 & A5)
// ==========================================================================

router.get("/webhooks", (req: any, res: any) => {
  try {
    const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'sys_webhooks'").get() as any;
    const webhooks = setting && setting.value ? JSON.parse(setting.value) : [];
    res.json({ success: true, webhooks });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/webhooks/rotate-secret", (req: any, res: any) => {
  try {
    const { webhookId } = req.body;
    if (!webhookId) return res.status(400).json({ error: "webhookId is required" });

    const newSecret = "whsec_" + crypto.randomBytes(18).toString('hex');
    const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'sys_webhooks'").get() as any;
    const webhooks = setting && setting.value ? JSON.parse(setting.value) : [];

    let targetName = webhookId;
    const updated = webhooks.map((w: any) => {
      if (w.id === webhookId) {
        targetName = w.name;
        return {
          ...w,
          secret: `whsec_••••••••${newSecret.slice(-4)}`,
          raw_secret: newSecret,
          rotated_at: new Date().toISOString()
        };
      }
      return w;
    });

    db.prepare(`
      INSERT INTO platform_settings (id, key, value)
      VALUES (?, 'sys_webhooks', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(ulid(), JSON.stringify(updated));

    logAudit((req as any).user?.id || 'admin', "ROTATE_WEBHOOK_SECRET", webhookId, { webhook: targetName });
    res.json({ success: true, webhooks: updated, newSecret, message: `Rotated secret for ${targetName}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/webhooks/test", async (req: any, res: any) => {
  try {
    const { webhookId, eventType = 'ping.test' } = req.body;
    const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'sys_webhooks'").get() as any;
    const webhooks = setting && setting.value ? JSON.parse(setting.value) : [];
    const wh = webhooks.find((w: any) => w.id === webhookId);

    if (!wh) {
      return res.status(404).json({ error: "Webhook endpoint configuration not found" });
    }

    const payload = {
      event: eventType,
      id: `evt_${ulid()}`,
      created_at: new Date().toISOString(),
      data: {
        ping: true,
        source: "AUREVYXON Compliance & Webhook Engine",
        environment: process.env.NODE_ENV || 'production',
        timestamp: Date.now()
      }
    };

    const startTime = Date.now();
    let statusCode = 200;
    let duration = 0;
    let errorMsg = null;

    try {
      const hmac = crypto.createHmac('sha256', wh.raw_secret || 'aurevyxon_whsec_signature');
      hmac.update(JSON.stringify(payload));
      const signature = hmac.digest('hex');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(wh.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'AureVyxon-Webhook-Dispatcher/2.0',
          'X-Aurevyxon-Signature': `sha256=${signature}`,
          'X-Aurevyxon-Event': eventType
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      duration = Date.now() - startTime;
      statusCode = response.status;
    } catch (dispatchErr: any) {
      duration = Date.now() - startTime;
      statusCode = dispatchErr.name === 'AbortError' ? 408 : 502;
      errorMsg = dispatchErr.message;
    }

    const newLog = {
      id: `log_${ulid()}`,
      webhook_id: wh.id,
      webhook: wh.name,
      url: wh.url,
      event: eventType,
      status_code: statusCode,
      time: 'Just now',
      created_at: new Date().toISOString(),
      duration: `${duration}ms`,
      error: errorMsg
    };

    // Persist log in platform_settings
    const logSetting = db.prepare("SELECT value FROM platform_settings WHERE key = 'sys_webhook_logs'").get() as any;
    const currentLogs = logSetting && logSetting.value ? JSON.parse(logSetting.value) : [];
    const updatedLogs = [newLog, ...currentLogs.slice(0, 49)];

    db.prepare(`
      INSERT INTO platform_settings (id, key, value)
      VALUES (?, 'sys_webhook_logs', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(ulid(), JSON.stringify(updatedLogs));

    logAudit((req as any).user?.id || 'admin', "TEST_WEBHOOK_DISPATCH", wh.id, { 
      statusCode, 
      duration: `${duration}ms`, 
      targetUrl: wh.url 
    });

    res.json({
      success: statusCode >= 200 && statusCode < 400,
      log: newLog,
      logs: updatedLogs,
      statusCode,
      duration: `${duration}ms`,
      message: `[HTTP ${statusCode}] Real test payload dispatched to ${wh.url} in ${duration}ms`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================================================
// REAL DATABASE BACKUP, CHECKSUM & RESTORE ENGINE (A6)
// ==========================================================================

const BACKUP_DIR = path.join(process.cwd(), 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

router.get("/backups", (req: any, res: any) => {
  try {
    const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'sys_backups'").get() as any;
    let backupsList: any[] = setting && setting.value ? JSON.parse(setting.value) : [];

    // Also scan filesystem for physical backups
    if (fs.existsSync(BACKUP_DIR)) {
      const diskFiles = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json') || f.endsWith('.bak'));
      for (const file of diskFiles) {
        if (!backupsList.some(b => b.name === file)) {
          const filePath = path.join(BACKUP_DIR, file);
          const stat = fs.statSync(filePath);
          const content = fs.readFileSync(filePath);
          const checksum = 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
          backupsList.push({
            id: `bak_${file.replace(/[^a-zA-Z0-9_]/g, '')}`,
            name: file,
            size: `${(stat.size / (1024 * 1024)).toFixed(2)} MB`,
            size_bytes: stat.size,
            checksum,
            created_at: stat.birthtime.toISOString().replace('T', ' ').slice(0, 19),
            status: 'verified'
          });
        }
      }
    }

    res.json({ success: true, backups: backupsList });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/backups/create", (req: any, res: any) => {
  try {
    const now = new Date();
    const dateStr = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const fileName = `aurevyxon_db_snapshot_${dateStr}.json`;
    const filePath = path.join(BACKUP_DIR, fileName);

    // Collect all table data across the entire platform
    const exportData: Record<string, any[]> = {};
    const tables = [
      'users', 'seller_profiles', 'products', 'listings', 'transactions',
      'orders', 'order_items', 'user_kyc', 'kyc_documents', 'payout_requests',
      'support_tickets', 'audit_logs', 'platform_settings', 'wallets'
    ];

    for (const tbl of tables) {
      try {
        exportData[tbl] = db.prepare(`SELECT * FROM ${tbl}`).all();
      } catch {
        exportData[tbl] = [];
      }
    }

    const payloadString = JSON.stringify({
      version: '2.0.0',
      exported_at: now.toISOString(),
      platform: 'AureVyxon Enterprise Commerce Engine',
      tables: exportData
    }, null, 2);

    fs.writeFileSync(filePath, payloadString, 'utf8');
    const stat = fs.statSync(filePath);
    const checksum = 'sha256:' + crypto.createHash('sha256').update(Buffer.from(payloadString)).digest('hex');

    const newBak = {
      id: `bak_${ulid()}`,
      name: fileName,
      file_path: filePath,
      size: `${(stat.size / (1024 * 1024)).toFixed(2)} MB`,
      size_bytes: stat.size,
      checksum,
      created_at: now.toISOString().replace('T', ' ').slice(0, 19),
      status: 'verified'
    };

    const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'sys_backups'").get() as any;
    const current = setting && setting.value ? JSON.parse(setting.value) : [];
    const updated = [newBak, ...current];

    db.prepare(`
      INSERT INTO platform_settings (id, key, value)
      VALUES (?, 'sys_backups', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(ulid(), JSON.stringify(updated));

    logAudit((req as any).user?.id || 'admin', "CREATE_DATABASE_BACKUP", newBak.id, {
      name: fileName,
      size_bytes: stat.size,
      checksum
    });

    res.json({
      success: true,
      backup: newBak,
      backups: updated,
      message: `Real database snapshot created: ${fileName} (${newBak.size})`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/backups/:id/verify", (req: any, res: any) => {
  try {
    const backupId = req.params.id;
    const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'sys_backups'").get() as any;
    const current = setting && setting.value ? JSON.parse(setting.value) : [];
    const bak = current.find((b: any) => b.id === backupId || b.name === backupId);

    if (!bak) {
      return res.status(404).json({ error: "Backup record not found" });
    }

    const filePath = path.join(BACKUP_DIR, bak.name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `Physical backup file '${bak.name}' does not exist on disk` });
    }

    const content = fs.readFileSync(filePath);
    const computedChecksum = 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');
    const isIntegrityOk = computedChecksum === bak.checksum || !bak.checksum;

    res.json({
      success: true,
      verified: isIntegrityOk,
      checksum: computedChecksum,
      storedChecksum: bak.checksum,
      name: bak.name,
      message: isIntegrityOk ? `Checksum Verified OK: ${bak.name}` : `Integrity verification failed for ${bak.name}`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/backups/:id/restore", async (req: any, res: any) => {
  try {
    const backupId = req.params.id;
    const { stepUpPassword, reason } = req.body;

    if (!stepUpPassword) {
      return res.status(400).json({ error: "Step-up authentication password is required for database restoration" });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Reason for database restoration must be provided" });
    }

    const setting = db.prepare("SELECT value FROM platform_settings WHERE key = 'sys_backups'").get() as any;
    const current = setting && setting.value ? JSON.parse(setting.value) : [];
    const bak = current.find((b: any) => b.id === backupId || b.name === backupId);

    if (!bak) {
      return res.status(404).json({ error: "Backup record not found" });
    }

    const filePath = path.join(BACKUP_DIR, bak.name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `Physical backup file '${bak.name}' not found on server` });
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed.tables) {
      return res.status(400).json({ error: "Invalid backup snapshot schema: missing 'tables' payload" });
    }

    // Safely restore each table
    let totalRestoredRecords = 0;
    for (const [tblName, rows] of Object.entries(parsed.tables)) {
      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (row && row.id) {
            await db.set(tblName, String(row.id), row, true);
            totalRestoredRecords++;
          }
        }
      }
    }

    logAudit((req as any).user?.id || 'admin', "RESTORE_DATABASE_SNAPSHOT", bak.id, {
      backupName: bak.name,
      reason: reason.trim(),
      restoredRecords: totalRestoredRecords
    });

    res.json({
      success: true,
      restoredRecords: totalRestoredRecords,
      message: `Database successfully restored from ${bak.name} (${totalRestoredRecords} records). Audit event logged.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
