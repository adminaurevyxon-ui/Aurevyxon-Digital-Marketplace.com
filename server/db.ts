import { initializeApp as initAdminApp, getApps as getAdminApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { ulid } from 'ulid';
import { ALLOWED_ADMIN_EMAILS, normalizeEmail, isAllowedAdminEmail } from '../src/config/admin.ts';
import { ALL_COUNTRIES_DATA } from './countriesData.ts';

// -----------------------------------------------------------------------------
// 1. Firebase Admin Initialization (Direct Primary Cloud Firestore)
// -----------------------------------------------------------------------------
let firebaseConfig: any = {};
try {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }
} catch (e) {
  console.warn("⚠️ [Firestore] Notice: could not load firebase-applet-config.json:", e);
}

let credential: any;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  try {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    credential = cert(sa);
  } catch (e) {
    if (fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)) {
      credential = cert(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    }
  }
}

const projectId = process.env.FIREBASE_PROJECT_ID 
  || process.env.GOOGLE_CLOUD_PROJECT 
  || firebaseConfig.projectId 
  || "gen-lang-client-0017129830";

const adminApp = getAdminApps().length > 0 
  ? getAdminApps()[0] 
  : initAdminApp({
      credential: credential || undefined,
      projectId
    });

const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID 
  || process.env.FIREBASE_DATABASE_ID 
  || firebaseConfig.firestoreDatabaseId;

export const firestore = firestoreDatabaseId 
  ? getFirestore(adminApp, firestoreDatabaseId) 
  : getFirestore(adminApp);

// -----------------------------------------------------------------------------
// 2. High-Performance In-Memory Cache (Synchronously Mirrored with Cloud Firestore)
// -----------------------------------------------------------------------------
const memoryCache: Record<string, Map<string, any>> = {};

// Canonical collection alias mapping to prevent collection name fragmentation
const COLLECTION_ALIASES: Record<string, string> = {
  'products': 'listings',
  'listings': 'listings',
  'sellers': 'seller_profiles',
  'seller_profiles': 'seller_profiles',
  'kyc_submissions': 'seller_profiles',
  'tickets': 'support_tickets',
  'support_tickets': 'support_tickets',
  'messages': 'direct_messages',
  'direct_messages': 'direct_messages',
  'payouts': 'payout_requests',
  'payout_requests': 'payout_requests'
};

function getCanonicalColName(colName: string): string {
  if (!colName) return "";
  const clean = colName.toLowerCase().trim();
  return COLLECTION_ALIASES[clean] || clean;
}

function getCollectionCache(colName: string): Map<string, any> {
  const canonical = getCanonicalColName(colName);
  if (!memoryCache[canonical]) {
    memoryCache[canonical] = new Map<string, any>();
  }
  return memoryCache[canonical];
}

let isFirestoreQuotaExhausted = false;
let quotaExhaustedUntil = 0;
let lastQuotaExhaustedWarning = 0;

interface PendingWriteItem {
  colName: string;
  docId: string;
  payload: any;
  merge: boolean;
  isDelete?: boolean;
  queuedAt: number;
  attempts: number;
  lastError?: string;
}

const JOURNAL_PATH = path.resolve(process.cwd(), '.pending_writes_journal.json');
let pendingWriteQueue: PendingWriteItem[] = [];

// Load unpersisted writes from disk journal on startup
try {
  if (fs.existsSync(JOURNAL_PATH)) {
    const raw = fs.readFileSync(JOURNAL_PATH, 'utf8');
    pendingWriteQueue = JSON.parse(raw);
    console.log(`📦 [Durable Write Journal] Loaded ${pendingWriteQueue.length} pending write items from disk to retry persistence.`);
    for (const item of pendingWriteQueue) {
      if (!item.isDelete && item.payload) {
        getCollectionCache(item.colName).set(String(item.docId), item.payload);
      }
    }
  }
} catch (err) {
  console.warn("⚠️ [Durable Write Journal] Error reading journal file on boot:", err);
}

function saveJournalToDisk() {
  try {
    fs.writeFileSync(JOURNAL_PATH, JSON.stringify(pendingWriteQueue, null, 2), 'utf8');
  } catch (err) {
    console.error("❌ [Durable Write Journal] Failed to write journal to disk:", err);
  }
}

function queuePendingWrite(colName: string, docId: string, payload: any, merge = true, isDelete = false, errorMsg?: string) {
  const existingIdx = pendingWriteQueue.findIndex(w => w.colName === colName && w.docId === docId);
  // Strip large media buffers from journal to protect memory
  let safePayload = payload;
  if (safePayload && typeof safePayload === 'object' && safePayload.data && typeof safePayload.data === 'string' && safePayload.data.length > 20000) {
    safePayload = { ...safePayload };
    delete safePayload.data;
  }

  const item: PendingWriteItem = {
    colName,
    docId,
    payload: safePayload,
    merge,
    isDelete,
    queuedAt: Date.now(),
    attempts: 0,
    lastError: errorMsg
  };
  if (existingIdx >= 0) {
    pendingWriteQueue[existingIdx] = item;
  } else {
    if (pendingWriteQueue.length > 100) {
      pendingWriteQueue.shift(); // keep max 100
    }
    pendingWriteQueue.push(item);
  }
  saveJournalToDisk();
}

async function flushPendingWrites() {
  if (pendingWriteQueue.length === 0) return;
  const items = [...pendingWriteQueue];
  const remaining: PendingWriteItem[] = [];

  for (const item of items) {
    try {
      if (item.isDelete) {
        await firestore.collection(item.colName).doc(item.docId).delete();
      } else {
        await firestore.collection(item.colName).doc(item.docId).set(item.payload, { merge: item.merge });
      }
      console.log(`✅ [Durable Write Journal] Confirmed persistence for [${item.colName}/${item.docId}]`);
    } catch (err: any) {
      item.attempts += 1;
      item.lastError = err?.message || String(err);
      remaining.push(item);
    }
  }

  pendingWriteQueue = remaining;
  saveJournalToDisk();
}

// Background retry loop every 30 seconds
setInterval(flushPendingWrites, 30000);

function handleFirestoreWriteError(colName: string, docId: string, err: any, payload: any, merge = true, isDelete = false) {
  const errMsg = err?.message || String(err);
  if (errMsg.includes('resource-exhausted') || errMsg.includes('Quota limit exceeded') || errMsg.includes('quota') || err?.code === 8) {
    isFirestoreQuotaExhausted = true;
    quotaExhaustedUntil = Date.now() + 60 * 60 * 1000; // 1 hour cooldown before testing cloud write again
    const now = Date.now();
    if (now - lastQuotaExhaustedWarning > 300000) { // Log once per 5 minutes at most
      lastQuotaExhaustedWarning = now;
      console.warn(`⚠️ [Firestore Quota] Write quota reached. Persisting write to durable disk journal for retry.`);
    }
  } else {
    console.error(`Firestore write error [${colName}/${docId}]:`, errMsg);
  }
  queuePendingWrite(colName, docId, payload, merge, isDelete, errMsg);
}

function shouldAttemptFirestoreWrite(): boolean {
  if (!isFirestoreQuotaExhausted) return true;
  if (Date.now() > quotaExhaustedUntil) {
    isFirestoreQuotaExhausted = false; // test again
    return true;
  }
  return false;
}

function cleanFirestorePayload(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanFirestorePayload);
  
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (!key || typeof key !== 'string' || !key.trim()) continue;
    if (val === undefined) {
      cleaned[key] = null;
    } else if (val !== null && typeof val === 'object') {
      cleaned[key] = cleanFirestorePayload(val);
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

function makeThenable(val: any): any {
  if (val !== null && val !== undefined && (typeof val === 'object' || Array.isArray(val))) {
    if (!val.then) {
      Object.defineProperty(val, 'then', {
        value: function(resolve: any) {
          return Promise.resolve(this).then(resolve);
        },
        configurable: true,
        writable: true,
        enumerable: false
      });
    }
  }
  return val;
}

// -----------------------------------------------------------------------------
// 3. Primary Database Abstraction Engine
// -----------------------------------------------------------------------------
export const db: any = {
  getSync(colName: string, id: string): any {
    if (!id) return null;
    return getCollectionCache(colName).get(String(id)) || null;
  },

  getAllSync(colName: string, conditions: { field: string; op: any; value: any; fallback?: any }[] = [], sortField?: string, sortOrder: 'asc' | 'desc' = 'desc', limitVal?: number): any[] {
    const cache = getCollectionCache(colName);
    let items = Array.from(cache.values());

    for (const cond of conditions) {
      if (cond.value !== undefined) {
        items = items.filter((item: any) => {
          if (!item) return false;
          let itemVal = item[cond.field];
          if (itemVal === undefined || itemVal === null) {
            itemVal = cond.fallback !== undefined ? cond.fallback : itemVal;
          }

          if (cond.op === '==') {
            if (typeof itemVal === 'string' && typeof cond.value === 'string') {
              return itemVal.toLowerCase().trim() === cond.value.toLowerCase().trim();
            }
            if (typeof itemVal === 'number' || typeof cond.value === 'number') {
              return Number(itemVal) === Number(cond.value);
            }
            return String(itemVal) === String(cond.value);
          }
          if (cond.op === '!=') {
            if (typeof itemVal === 'string' && typeof cond.value === 'string') {
              return itemVal.toLowerCase().trim() !== cond.value.toLowerCase().trim();
            }
            if (typeof itemVal === 'number' || typeof cond.value === 'number') {
              return Number(itemVal) !== Number(cond.value);
            }
            return String(itemVal) !== String(cond.value);
          }
          if (cond.op === '>') return Number(itemVal) > Number(cond.value);
          if (cond.op === '>=') return Number(itemVal) >= Number(cond.value);
          if (cond.op === '<') return Number(itemVal) < Number(cond.value);
          if (cond.op === '<=') return Number(itemVal) <= Number(cond.value);
          if (cond.op === 'in') {
            if (Array.isArray(cond.value)) {
              if (cond.value.length === 0) return true;
              return cond.value.some(v => {
                if (typeof itemVal === 'string' && typeof v === 'string') {
                  return itemVal.toLowerCase().trim() === v.toLowerCase().trim();
                }
                return String(v) === String(itemVal);
              });
            }
            return false;
          }
          if (cond.op === 'not_in') {
            if (Array.isArray(cond.value)) {
              if (cond.value.length === 0) return true;
              return !cond.value.some(v => {
                if (typeof itemVal === 'string' && typeof v === 'string') {
                  return itemVal.toLowerCase().trim() === v.toLowerCase().trim();
                }
                return String(v) === String(itemVal);
              });
            }
            return true;
          }
          if (cond.op === 'isNull') return itemVal === null || itemVal === undefined || itemVal === '';
          if (cond.op === 'isNotNull') return itemVal !== null && itemVal !== undefined && itemVal !== '';
          if (cond.op === 'like') {
            const pattern = String(cond.value || '').replace(/%/g, '').toLowerCase();
            return String(itemVal || '').toLowerCase().includes(pattern);
          }
          if (cond.op === 'or_group') {
            const subConds = Array.isArray(cond.value) ? cond.value : [];
            return subConds.some((sub: any) => {
              let subVal = item[sub.field];
              if (subVal === undefined || subVal === null) {
                subVal = sub.fallback !== undefined ? sub.fallback : subVal;
              }
              if (sub.op === 'like') {
                const pattern = String(sub.value || '').replace(/%/g, '').toLowerCase();
                return String(subVal || '').toLowerCase().includes(pattern);
              }
              if (sub.op === '==') {
                if (typeof subVal === 'string' && typeof sub.value === 'string') {
                  return subVal.toLowerCase().trim() === sub.value.toLowerCase().trim();
                }
                if (typeof subVal === 'number' || typeof sub.value === 'number') {
                  return Number(subVal) === Number(sub.value);
                }
                return String(subVal) === String(sub.value);
              }
              return false;
            });
          }
          if (cond.op === 'date==') {
            const itemDate = itemVal ? String(itemVal).split('T')[0] : '';
            return itemDate === String(cond.value);
          }
          return true;
        });
      }
    }

    if (sortField) {
      items.sort((a: any, b: any) => {
        const valA = a[sortField] !== undefined ? a[sortField] : '';
        const valB = b[sortField] !== undefined ? b[sortField] : '';
        if (sortOrder === 'desc') {
          return valA < valB ? 1 : valA > valB ? -1 : 0;
        } else {
          return valA > valB ? 1 : valA < valB ? -1 : 0;
        }
      });
    }

    if (limitVal && limitVal > 0) {
      items = items.slice(0, limitVal);
    }

    return items;
  },

  async get(colName: string, id: string): Promise<any> {
    if (!id) return null;
    const cached = this.getSync(colName, id);
    if (cached) return cached;

    try {
      const canonical = getCanonicalColName(colName);
      const docSnap = await firestore.collection(canonical).doc(String(id)).get();
      if (docSnap.exists) {
        const data = docSnap.data();
        getCollectionCache(canonical).set(String(id), data);
        return data;
      }
      return null;
    } catch (e) {
      console.error(`Firestore get error [${colName}/${id}]:`, e);
      return null;
    }
  },

  async set(colName: string, id: string, data: any, merge = true): Promise<any> {
    const canonical = getCanonicalColName(colName);
    const docId = String(id);
    const existing = getCollectionCache(canonical).get(docId) || {};
    const rawPayload = merge ? { ...existing, ...data, id: docId } : { ...data, id: docId };
    const payload = cleanFirestorePayload(rawPayload);
    
    // Store in memory cache immediately
    let memPayload = payload;
    if (canonical === 'media_files' && payload && payload.data && typeof payload.data === 'string' && payload.data.length > 50000) {
      memPayload = { ...payload };
      delete memPayload.data;
    }
    getCollectionCache(canonical).set(docId, memPayload);

    // Persist to Cloud Firestore using Admin SDK
    if (shouldAttemptFirestoreWrite()) {
      try {
        const approxSize = JSON.stringify(payload).length;
        if (approxSize > 950000) {
          console.warn(`⚠️ [Firestore Guard] Skipping direct Firestore doc write for [${canonical}/${docId}] because size (${approxSize} bytes) exceeds 1MB limit. Stored safely in memory cache.`);
          return payload;
        }
        await firestore.collection(canonical).doc(docId).set(payload, { merge });
        
        // Mirror to secondary alias if applicable
        if (canonical === 'listings' && colName === 'products') {
          await firestore.collection('products').doc(docId).set(payload, { merge }).catch(() => {});
        } else if (canonical === 'seller_profiles' && colName === 'sellers') {
          await firestore.collection('sellers').doc(docId).set(payload, { merge }).catch(() => {});
        }
      } catch (e: any) {
        handleFirestoreWriteError(canonical, docId, e, payload, merge, false);
      }
    } else {
      queuePendingWrite(canonical, docId, payload, merge, false, "Firestore write delayed by quota cooldown; queued to journal");
    }
    return payload;
  },

  async update(colName: string, id: string, data: any): Promise<void> {
    const canonical = getCanonicalColName(colName);
    const docId = String(id);
    const existing = getCollectionCache(canonical).get(docId) || {};
    const rawPayload = { ...existing, ...data, updated_at: new Date().toISOString() };
    const payload = cleanFirestorePayload(rawPayload);

    getCollectionCache(canonical).set(docId, payload);

    if (shouldAttemptFirestoreWrite()) {
      try {
        const approxSize = JSON.stringify(payload).length;
        if (approxSize > 950000) {
          console.warn(`⚠️ [Firestore Guard] Skipping direct Firestore doc update for [${canonical}/${docId}] because size (${approxSize} bytes) exceeds 1MB limit. Stored in memory cache.`);
          return;
        }
        await firestore.collection(canonical).doc(docId).set(payload, { merge: true });
      } catch (e: any) {
        handleFirestoreWriteError(canonical, docId, e, payload, true, false);
      }
    } else {
      queuePendingWrite(canonical, docId, payload, true, false, "Firestore write delayed by quota cooldown; queued to journal");
    }
  },

  async delete(colName: string, id: string): Promise<void> {
    const canonical = getCanonicalColName(colName);
    const docId = String(id);
    getCollectionCache(canonical).delete(docId);

    if (shouldAttemptFirestoreWrite()) {
      try {
        await firestore.collection(canonical).doc(docId).delete();
      } catch (e: any) {
        handleFirestoreWriteError(canonical, docId, e, null, false, true);
      }
    } else {
      queuePendingWrite(canonical, docId, null, false, true, "Firestore write delayed by quota cooldown; queued to journal");
    }
  },

  async getAll(colName: string, conditions: { field: string; op: any; value: any; fallback?: any }[] = [], sortField?: string, sortOrder: 'asc' | 'desc' = 'desc', limitVal?: number): Promise<any[]> {
    const cachedItems = this.getAllSync(colName, conditions, sortField, sortOrder, limitVal);
    if (cachedItems.length > 0) {
      return cachedItems;
    }

    try {
      const canonical = getCanonicalColName(colName);
      const snap = await firestore.collection(canonical).get();
      const docs = snap.docs.map((d: any) => d.data());
      const cache = getCollectionCache(canonical);
      docs.forEach((item: any) => {
        if (item.id || item.key) {
          cache.set(String(item.id || item.key), item);
        }
      });
      return this.getAllSync(colName, conditions, sortField, sortOrder, limitVal);
    } catch (err) {
      return [];
    }
  },

  async getSetting(key: string, defaultVal: string = "0"): Promise<string> {
    const cached = this.getSync('platform_settings', key);
    if (cached && cached.value !== undefined) return String(cached.value);

    const data = await this.get('platform_settings', key);
    return data && data.value !== undefined ? String(data.value) : defaultVal;
  },

  async setSetting(key: string, value: string): Promise<void> {
    await this.set('platform_settings', key, { key, value: String(value) });
  },

  transaction(fn: any): any {
    return async (...args: any[]) => {
      return await fn(...args);
    };
  },

  prepare(sqlStr: string): any {
    const sql = sqlStr.trim();
    const isSelect = /^SELECT/i.test(sql);
    const isInsert = /^(INSERT|REPLACE)/i.test(sql);
    const isUpdate = /^UPDATE/i.test(sql);
    const isDelete = /^DELETE/i.test(sql);
    const isAlter = /^ALTER/i.test(sql);
    const isPragma = /^PRAGMA/i.test(sql);

    let tableName = "";
    if (isSelect) {
      const match = sql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
      tableName = match ? match[1].toLowerCase() : "";
    } else if (isInsert) {
      const match = sql.match(/INTO\s+([a-zA-Z0-9_]+)/i);
      tableName = match ? match[1].toLowerCase() : "";
    } else if (isUpdate) {
      const match = sql.match(/UPDATE\s+([a-zA-Z0-9_]+)/i);
      tableName = match ? match[1].toLowerCase() : "";
    } else if (isDelete) {
      const match = sql.match(/FROM\s+([a-zA-Z0-9_]+)/i);
      tableName = match ? match[1].toLowerCase() : "";
    }

    // Helper to tokenize SQL by delimiter while respecting quotes and nested parentheses
    const splitSqlTokens = (str: string, delimiter = ','): string[] => {
      const results: string[] = [];
      let current = '';
      let inSingleQuote = false;
      let inDoubleQuote = false;
      let parenDepth = 0;

      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === "'" && !inDoubleQuote) {
          if (inSingleQuote && str[i + 1] === "'") {
            current += "''";
            i++;
            continue;
          }
          inSingleQuote = !inSingleQuote;
          current += char;
        } else if (char === '"' && !inSingleQuote) {
          inDoubleQuote = !inDoubleQuote;
          current += char;
        } else if (!inSingleQuote && !inDoubleQuote) {
          if (char === '(') {
            parenDepth++;
            current += char;
          } else if (char === ')') {
            if (parenDepth > 0) parenDepth--;
            current += char;
          } else if (char === delimiter && parenDepth === 0) {
            results.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        } else {
          current += char;
        }
      }
      if (current.trim()) {
        results.push(current.trim());
      }
      return results;
    };

    const cleanFieldAndFallback = (raw: string): { field: string; fallback?: any } => {
      if (!raw) return { field: "" };
      let s = raw.trim();

      // Check COALESCE(field, fallback)
      const coalesceMatch = s.match(/^COALESCE\s*\(\s*([a-zA-Z0-9_.]+)\s*,\s*([^)]+)\s*\)/i);
      if (coalesceMatch) {
        let field = coalesceMatch[1].replace(/^[a-zA-Z0-9_]+\./, '').trim();
        let fallbackStr = coalesceMatch[2].trim();
        let fallback: any = fallbackStr;
        if (fallbackStr.startsWith("'") && fallbackStr.endsWith("'")) {
          fallback = fallbackStr.slice(1, -1);
        } else if (!isNaN(Number(fallbackStr))) {
          fallback = Number(fallbackStr);
        }
        return { field, fallback };
      }

      // Remove SQL functions like LOWER(...), TRIM(...), DATE(...) recursively
      while (/^(?:LOWER|TRIM|DATE|COALESCE)\s*\(/i.test(s)) {
        s = s.replace(/^(?:LOWER|TRIM|DATE)\s*\(\s*/i, '').replace(/\s*\)$/, '');
      }
      // Strip table alias prefix like u., users., l., t., o., etc.
      s = s.replace(/^[a-zA-Z0-9_]+\./, '');
      // Strip brackets, parenthesis, quotes
      s = s.replace(/[()'"\s]/g, '');
      return { field: s.trim() };
    };

    const cleanField = (raw: string): string => {
      return cleanFieldAndFallback(raw).field;
    };

    const parseWhereConditions = (sqlQuery: string, params: any[]): { field: string; op: string; value: any; fallback?: any }[] => {
      const conditions: { field: string; op: string; value: any; fallback?: any }[] = [];
      const whereMatch = sqlQuery.match(/WHERE\s+([\s\S]+?)(?:ORDER BY|GROUP BY|LIMIT|$)/i);
      if (!whereMatch) return conditions;

      const whereClause = whereMatch[1];
      let paramIdx = 0;

      // Check IN subquery or list clauses e.g. column IN (SELECT id FROM ...) or column IN (?, ?, ?)
      const subqueryMatches = whereClause.match(/((?:COALESCE\s*\([^)]+\)|[a-zA-Z0-9_().]+))\s+(NOT\s+IN|IN)\s*\(\s*(SELECT\s+[\s\S]+?)\s*\)/gi);
      if (subqueryMatches) {
        for (const sqClause of subqueryMatches) {
          const match = sqClause.match(/((?:COALESCE\s*\([^)]+\)|[a-zA-Z0-9_().]+))\s+(NOT\s+IN|IN)\s*\(\s*(SELECT\s+[\s\S]+?)\s*\)/i);
          if (match) {
            const { field, fallback } = cleanFieldAndFallback(match[1]);
            const isNotIn = /NOT\s+IN/i.test(match[2]);
            const innerSql = match[3];
            try {
              const innerRows = db.prepare(innerSql).all();
              const selectColMatch = innerSql.match(/SELECT\s+([a-zA-Z0-9_.*]+)/i);
              const selectCol = selectColMatch ? selectColMatch[1].replace(/^[a-zA-Z0-9_]+\./, '').trim() : 'id';
              const values = innerRows.map((r: any) => r[selectCol] || r.id).filter((v: any) => v !== undefined && v !== null);
              conditions.push({ field, op: isNotIn ? 'not_in' : 'in', value: values, fallback });
            } catch (sqErr) {
              console.warn("[Subquery Parse Notice]:", sqErr);
            }
          }
        }
      }

      // Check standard IN clauses e.g. LOWER(TRIM(email)) IN (?, ?, ?) or COALESCE(status, 'active') IN ('active', 'approved')
      const inMatches = whereClause.match(/((?:COALESCE\s*\([^)]+\)|[a-zA-Z0-9_().]+))\s+IN\s*\(([^)]+)\)/gi);
      if (inMatches) {
        for (const inClause of inMatches) {
          if (/SELECT/i.test(inClause)) continue;
          const match = inClause.match(/((?:COALESCE\s*\([^)]+\)|[a-zA-Z0-9_().]+))\s+IN\s*\(([^)]+)\)/i);
          if (match) {
            const { field, fallback } = cleanFieldAndFallback(match[1]);
            const rawTokens = match[2].split(',').map(s => s.trim());
            const values: any[] = [];
            for (const token of rawTokens) {
              if (token === '?') {
                if (paramIdx < params.length) {
                  values.push(params[paramIdx++]);
                }
              } else if (token.startsWith("'") && token.endsWith("'")) {
                values.push(token.slice(1, -1));
              } else if (!isNaN(Number(token))) {
                values.push(Number(token));
              } else {
                values.push(token);
              }
            }
            conditions.push({ field, op: 'in', value: values, fallback });
          }
        }
      }

      // Check DATE(created_at) = ?
      const dateMatches = whereClause.match(/DATE\(([a-zA-Z0-9_.]+)\)\s*=\s*\?/gi);
      if (dateMatches) {
        for (const dClause of dateMatches) {
          const match = dClause.match(/DATE\(([a-zA-Z0-9_.]+)\)\s*=\s*\?/i);
          if (match) {
            const field = cleanField(match[1]);
            if (paramIdx < params.length) {
              conditions.push({ field, op: 'date==', value: params[paramIdx++] });
            }
          }
        }
      }

      // Handle split by AND
      const simpleClauses = whereClause.split(/\s+AND\s+/i);
      for (const clause of simpleClauses) {
        if (/IN\s*\(/i.test(clause) || /DATE\(/i.test(clause)) continue;

        // Check for OR group e.g. (seller_id = ? OR buyer_id = ?) or (id LIKE ? OR name LIKE ?)
        if (clause.includes(' OR ') || (clause.startsWith('(') && clause.includes(' OR '))) {
          const inner = clause.replace(/^\(|\)$/g, '').trim();
          const orParts = inner.split(/\s+OR\s+/i);
          const orConditions: { field: string; op: string; value: any; fallback?: any }[] = [];
          for (const orPart of orParts) {
            if (orPart.includes('LIKE')) {
              const parts = orPart.split(/LIKE/i);
              if (parts.length === 2) {
                const { field, fallback } = cleanFieldAndFallback(parts[0]);
                const valExpr = parts[1].trim();
                let val: any = valExpr;
                if (valExpr === '?') val = params[paramIdx++];
                else if (valExpr.startsWith("'") && valExpr.endsWith("'")) val = valExpr.slice(1, -1);
                orConditions.push({ field, op: 'like', value: val, fallback });
              }
            } else if (orPart.includes('=')) {
              const parts = orPart.split('=');
              if (parts.length === 2) {
                const { field, fallback } = cleanFieldAndFallback(parts[0]);
                const valExpr = parts[1].trim();
                let val: any = valExpr;
                if (valExpr === '?') val = params[paramIdx++];
                else if (valExpr.startsWith("'") && valExpr.endsWith("'")) val = valExpr.slice(1, -1);
                else if (!isNaN(Number(valExpr))) val = Number(valExpr);
                orConditions.push({ field, op: '==', value: val, fallback });
              }
            }
          }
          if (orConditions.length > 0) {
            conditions.push({ field: '_or_group_', op: 'or_group', value: orConditions });
          }
          continue;
        }

        if (/IS\s+NULL/i.test(clause)) {
          const colMatch = clause.match(/([a-zA-Z0-9_.]+)\s+IS\s+NULL/i);
          if (colMatch) {
            const field = cleanField(colMatch[1]);
            conditions.push({ field, op: 'isNull', value: true });
          }
        } else if (/IS\s+NOT\s+NULL/i.test(clause)) {
          const colMatch = clause.match(/([a-zA-Z0-9_.]+)\s+IS\s+NOT\s+NULL/i);
          if (colMatch) {
            const field = cleanField(colMatch[1]);
            conditions.push({ field, op: 'isNotNull', value: true });
          }
        } else if (/LIKE/i.test(clause)) {
          const parts = clause.split(/LIKE/i);
          if (parts.length === 2) {
            const { field, fallback } = cleanFieldAndFallback(parts[0]);
            const valExpr = parts[1].trim();
            let val: any = valExpr;
            if (valExpr === '?') val = params[paramIdx++];
            else if (valExpr.startsWith("'") && valExpr.endsWith("'")) val = valExpr.slice(1, -1);
            conditions.push({ field, op: 'like', value: val, fallback });
          }
        } else if (clause.includes('>=')) {
          const parts = clause.split('>=');
          if (parts.length === 2) {
            const { field, fallback } = cleanFieldAndFallback(parts[0]);
            const valExpr = parts[1].trim();
            let val: any = valExpr === '?' ? params[paramIdx++] : (!isNaN(Number(valExpr)) ? Number(valExpr) : valExpr.replace(/['"]/g, ''));
            conditions.push({ field, op: '>=', value: val, fallback });
          }
        } else if (clause.includes('<=')) {
          const parts = clause.split('<=');
          if (parts.length === 2) {
            const { field, fallback } = cleanFieldAndFallback(parts[0]);
            const valExpr = parts[1].trim();
            let val: any = valExpr === '?' ? params[paramIdx++] : (!isNaN(Number(valExpr)) ? Number(valExpr) : valExpr.replace(/['"]/g, ''));
            conditions.push({ field, op: '<=', value: val, fallback });
          }
        } else if (clause.includes('!=')) {
          const parts = clause.split('!=');
          if (parts.length === 2) {
            const { field, fallback } = cleanFieldAndFallback(parts[0]);
            const valExpr = parts[1].trim();
            if (valExpr === '?') {
              if (paramIdx < params.length) {
                conditions.push({ field, op: '!=', value: params[paramIdx++], fallback });
              }
            } else if (valExpr.startsWith("'") && valExpr.endsWith("'")) {
              conditions.push({ field, op: '!=', value: valExpr.slice(1, -1), fallback });
            } else if (!isNaN(Number(valExpr))) {
              conditions.push({ field, op: '!=', value: Number(valExpr), fallback });
            }
          }
        } else if (clause.includes('=')) {
          const parts = clause.split('=');
          if (parts.length === 2) {
            const { field, fallback } = cleanFieldAndFallback(parts[0]);
            const valExpr = parts[1].trim();
            if (valExpr === '?') {
              if (paramIdx < params.length) {
                conditions.push({ field, op: '==', value: params[paramIdx++], fallback });
              }
            } else if (valExpr.startsWith("'") && valExpr.endsWith("'")) {
              conditions.push({ field, op: '==', value: valExpr.slice(1, -1), fallback });
            } else if (!isNaN(Number(valExpr))) {
              conditions.push({ field, op: '==', value: Number(valExpr), fallback });
            }
          }
        } else if (clause.includes('>')) {
          const parts = clause.split('>');
          if (parts.length === 2) {
            const { field, fallback } = cleanFieldAndFallback(parts[0]);
            const valExpr = parts[1].trim();
            let val: any = valExpr === '?' ? params[paramIdx++] : (!isNaN(Number(valExpr)) ? Number(valExpr) : valExpr.replace(/['"]/g, ''));
            conditions.push({ field, op: '>', value: val, fallback });
          }
        } else if (clause.includes('<')) {
          const parts = clause.split('<');
          if (parts.length === 2) {
            const { field, fallback } = cleanFieldAndFallback(parts[0]);
            const valExpr = parts[1].trim();
            let val: any = valExpr === '?' ? params[paramIdx++] : (!isNaN(Number(valExpr)) ? Number(valExpr) : valExpr.replace(/['"]/g, ''));
            conditions.push({ field, op: '<', value: val, fallback });
          }
        }
      }

      return conditions;
    };

    // Helper to enrich joined tables (e.g. users, listings, seller_profiles)
    const enrichJoinedData = (rows: any[], querySql: string): any[] => {
      if (!rows || rows.length === 0) return rows;
      const hasJoin = /JOIN\s+([a-zA-Z0-9_]+)/i.test(querySql);
      if (!hasJoin) return rows;

      const usersCache = getCollectionCache('users');
      const listingsCache = getCollectionCache('listings');
      const sellerProfilesCache = getCollectionCache('seller_profiles');
      const transactionsCache = getCollectionCache('transactions');

      return rows.map(row => {
        const item = { ...row };

        // 1. Join users table if referenced
        const userId = item.user_id || item.seller_id || item.buyer_id;
        const sellerUser = item.seller_id ? usersCache.get(String(item.seller_id)) : null;
        const buyerUser = item.buyer_id ? usersCache.get(String(item.buyer_id)) : null;
        const directUser = item.user_id ? usersCache.get(String(item.user_id)) : null;
        const primaryUser = directUser || sellerUser || buyerUser;

        if (sellerUser) {
          if (!item.seller_name) item.seller_name = sellerUser.name || 'Seller';
          if (!item.seller_avatar) item.seller_avatar = sellerUser.avatar_url || '';
          if (!item.seller_email) item.seller_email = sellerUser.email || '';
          if (!item.author) item.author = sellerUser.name || 'Seller';
          if (item.is_verified === undefined) item.is_verified = sellerUser.is_verified || 0;
          if (item.is_banned === undefined) item.is_banned = sellerUser.is_banned || 0;
        }

        if (buyerUser) {
          if (!item.buyer_name) item.buyer_name = buyerUser.name || 'Buyer';
          if (!item.buyer_email) item.buyer_email = buyerUser.email || '';
        }

        if (directUser) {
          if (!item.user_name) item.user_name = directUser.name || 'User';
          if (!item.user_email) item.user_email = directUser.email || '';
          if (!item.user_avatar) item.user_avatar = directUser.avatar_url || '';
        }

        // 2. Join listings table if referenced
        if (item.listing_id) {
          const l = listingsCache.get(String(item.listing_id));
          if (l) {
            if (!item.product_title) item.product_title = l.title || '';
            if (!item.listing_title) item.listing_title = l.title || '';
            if (!item.title) item.title = l.title || '';
            if (!item.image_url) item.image_url = l.image_url || '';
            if (!item.file_url) item.file_url = l.file_url || '';
            if (!item.price && item.price !== 0) item.price = l.price || 0;
            if (!item.type) item.type = l.type || '';
            if (!item.mode) item.mode = l.mode || '';
          }
        }

        // 3. Join transactions table if referenced
        if (item.transaction_id) {
          const tx = transactionsCache.get(String(item.transaction_id));
          if (tx) {
            if (item.amount === undefined) item.amount = tx.amount || 0;
            if (!item.currency) item.currency = tx.currency || 'USD';
          }
        }

        return item;
      });
    };

    return {
      get: (...params: any[]): any => {
        if (isAlter || isPragma || !tableName) return makeThenable({});

        if (tableName === 'platform_settings' && params.length > 0) {
          const item = db.getSync('platform_settings', String(params[0]));
          if (item) return makeThenable(item);
        }

        const conditions = parseWhereConditions(sql, params);
        let items = db.getAllSync(tableName, conditions);

        // Multi-aggregate or Single aggregate calculation
        const isAggregate = /COUNT\(|SUM\(|AVG\(|MIN\(|MAX\(/i.test(sql);
        if (isAggregate) {
          const res: Record<string, any> = {};
          
          // Parse all aggregate expressions including COUNT(DISTINCT col)
          const aggMatches = sql.match(/(?:COALESCE\s*\(\s*)?(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*(DISTINCT\s+)?([a-zA-Z0-9_.*]+)\s*\)(?:\s*,\s*[^)]+\))?(?:\s+as\s+([a-zA-Z0-9_]+))?/gi);
          if (aggMatches) {
            for (const aggExpr of aggMatches) {
              const parsed = aggExpr.match(/(?:COALESCE\s*\(\s*)?(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*(DISTINCT\s+)?([a-zA-Z0-9_.*]+)\s*\)(?:\s*,\s*[^)]+\))?(?:\s+as\s+([a-zA-Z0-9_]+))?/i);
              if (parsed) {
                const func = parsed[1].toUpperCase();
                const isDistinct = Boolean(parsed[2]);
                const col = parsed[3].replace(/^[a-zA-Z0-9_]+\./, '').trim();
                const alias = parsed[4] ? parsed[4].trim() : `${func.toLowerCase()}_val`;

                if (func === 'COUNT') {
                  let cnt = 0;
                  if (col === '*') {
                    cnt = items.length;
                  } else if (isDistinct) {
                    const uniqueVals = new Set(
                      items.map((it: any) => it[col]).filter((v: any) => v !== undefined && v !== null && v !== '')
                    );
                    cnt = uniqueVals.size;
                  } else {
                    cnt = items.filter((it: any) => it[col] !== undefined && it[col] !== null).length;
                  }
                  res[alias] = cnt;
                  res.count = cnt;
                  res.c = cnt;
                } else if (func === 'SUM') {
                  const sumVal = items.reduce((s: number, it: any) => s + (Number(it[col]) || 0), 0);
                  res[alias] = sumVal;
                  if (!res.sum) res.sum = sumVal;
                } else if (func === 'AVG') {
                  const sumVal = items.reduce((s: number, it: any) => s + (Number(it[col]) || 0), 0);
                  res[alias] = items.length > 0 ? sumVal / items.length : 0;
                } else if (func === 'MIN') {
                  const vals = items.map((it: any) => Number(it[col]) || 0);
                  res[alias] = vals.length > 0 ? Math.min(...vals) : 0;
                } else if (func === 'MAX') {
                  const vals = items.map((it: any) => Number(it[col]) || 0);
                  res[alias] = vals.length > 0 ? Math.max(...vals) : 0;
                }
              }
            }
            return makeThenable(res);
          }

          return makeThenable({ count: items.length, c: items.length, val: items.length });
        }

        const enriched = enrichJoinedData(items, sql);
        return makeThenable(enriched[0] || null);
      },

      all: (...params: any[]): any => {
        if (isAlter || isPragma || !tableName) return makeThenable([]);

        const conditions = parseWhereConditions(sql, params);

        let sortField: string | undefined;
        let sortOrder: 'asc' | 'desc' = 'desc';
        if (sql.includes('ORDER BY')) {
          const orderMatch = sql.match(/ORDER BY\s+([a-zA-Z0-9_.]+)\s*(ASC|DESC)?/i);
          if (orderMatch) {
            sortField = cleanField(orderMatch[1]);
            sortOrder = (orderMatch[2] || 'DESC').toUpperCase() as 'asc' | 'desc';
          }
        }

        let limitVal: number | undefined;
        if (sql.includes('LIMIT')) {
          const limitMatch = sql.match(/LIMIT\s+(\d+|\?)/i);
          if (limitMatch) {
            if (limitMatch[1] === '?') {
              const lastParam = params[params.length - (sql.includes('OFFSET ?') ? 2 : 1)];
              if (lastParam !== undefined) limitVal = Number(lastParam);
            } else {
              limitVal = parseInt(limitMatch[1]);
            }
          }
        }

        const results = db.getAllSync(tableName, conditions, sortField, sortOrder, limitVal);

        // Handle GROUP BY queries e.g. SELECT status, COUNT(*) as count, SUM(amount) as total FROM ... GROUP BY status
        if (/GROUP\s+BY/i.test(sql)) {
          const groupByMatch = sql.match(/GROUP\s+BY\s+([a-zA-Z0-9_.]+)/i);
          if (groupByMatch) {
            const groupField = cleanField(groupByMatch[1]);
            const groupedMap = new Map<string, any[]>();
            for (const item of results) {
              const key = String(item[groupField] ?? 'unknown');
              if (!groupedMap.has(key)) groupedMap.set(key, []);
              groupedMap.get(key)!.push(item);
            }

            const groupResults: any[] = [];
            for (const [groupKey, groupItems] of groupedMap.entries()) {
              const groupRow: Record<string, any> = { [groupField]: groupKey };
              const aggMatches = sql.match(/(?:COALESCE\s*\(\s*)?(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*(DISTINCT\s+)?([a-zA-Z0-9_.*]+)\s*\)(?:\s*,\s*[^)]+\))?(?:\s+as\s+([a-zA-Z0-9_]+))?/gi);
              if (aggMatches) {
                for (const aggExpr of aggMatches) {
                  const parsed = aggExpr.match(/(?:COALESCE\s*\(\s*)?(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*(DISTINCT\s+)?([a-zA-Z0-9_.*]+)\s*\)(?:\s*,\s*[^)]+\))?(?:\s+as\s+([a-zA-Z0-9_]+))?/i);
                  if (parsed) {
                    const func = parsed[1].toUpperCase();
                    const isDistinct = Boolean(parsed[2]);
                    const col = parsed[3].replace(/^[a-zA-Z0-9_]+\./, '').trim();
                    const alias = parsed[4] ? parsed[4].trim() : `${func.toLowerCase()}_val`;

                    if (func === 'COUNT') {
                      if (col === '*') groupRow[alias] = groupItems.length;
                      else if (isDistinct) groupRow[alias] = new Set(groupItems.map(it => it[col]).filter(Boolean)).size;
                      else groupRow[alias] = groupItems.filter(it => it[col] !== undefined && it[col] !== null).length;
                    } else if (func === 'SUM') {
                      groupRow[alias] = groupItems.reduce((s, it) => s + (Number(it[col]) || 0), 0);
                    } else if (func === 'AVG') {
                      const sum = groupItems.reduce((s, it) => s + (Number(it[col]) || 0), 0);
                      groupRow[alias] = groupItems.length > 0 ? sum / groupItems.length : 0;
                    } else if (func === 'MIN') {
                      const vals = groupItems.map(it => Number(it[col]) || 0);
                      groupRow[alias] = vals.length > 0 ? Math.min(...vals) : 0;
                    } else if (func === 'MAX') {
                      const vals = groupItems.map(it => Number(it[col]) || 0);
                      groupRow[alias] = vals.length > 0 ? Math.max(...vals) : 0;
                    }
                  }
                }
              }
              groupResults.push(groupRow);
            }
            return makeThenable(enrichJoinedData(groupResults, sql));
          }
        }

        const enriched = enrichJoinedData(results, sql);
        return makeThenable(enriched);
      },

      run: (...params: any[]): any => {
        if (isAlter || isPragma || !tableName) return makeThenable({ changes: 0 });

        if (isDelete) {
          const conditions = parseWhereConditions(sql, params);
          if (conditions.length > 0) {
            const items = db.getAllSync(tableName, conditions);
            items.forEach(item => {
              const id = item.id || item.key;
              if (id) db.delete(tableName, String(id));
            });
            return makeThenable({ changes: items.length });
          } else if (params.length > 0) {
            const id = String(params[0]);
            db.delete(tableName, id);
            return makeThenable({ changes: 1 });
          }
          return makeThenable({ changes: 0 });
        }

        if (isInsert) {
          const colsMatch = sql.match(/\(([^)]+)\)\s*VALUES\s*\(([\s\S]+)\)/i);
          let columns: string[] = [];
          let valExprs: string[] = [];
          if (colsMatch) {
            columns = splitSqlTokens(colsMatch[1]).map(c => c.trim().replace(/[`"]/g, '')).filter(Boolean);
            valExprs = splitSqlTokens(colsMatch[2]);
          } else {
            const fallbackColsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
            columns = fallbackColsMatch ? splitSqlTokens(fallbackColsMatch[1]).map(c => c.trim().replace(/[`"]/g, '')).filter(Boolean) : [];
          }

          let paramIndex = 0;
          const payload: any = { created_at: new Date().toISOString() };
          for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const expr = valExprs[i] ? valExprs[i].trim() : '?';
            if (expr === '?') {
              if (paramIndex < params.length) {
                payload[col] = params[paramIndex++];
              }
            } else if (expr.startsWith("'") && expr.endsWith("'")) {
              payload[col] = expr.slice(1, -1);
            } else if (expr.toUpperCase() === 'NULL') {
              payload[col] = null;
            } else if (/^(CURRENT_TIMESTAMP|datetime\('now'\))/i.test(expr)) {
              payload[col] = new Date().toISOString();
            } else if (!isNaN(Number(expr))) {
              payload[col] = Number(expr);
            } else if (expr.includes('?')) {
              const qCount = (expr.match(/\?/g) || []).length;
              const subParams = params.slice(paramIndex, paramIndex + qCount);
              paramIndex += qCount;
              const validParam = subParams.find(p => p !== undefined && p !== null && p !== '');
              payload[col] = validParam !== undefined ? validParam : null;
            } else {
              payload[col] = expr;
            }
          }

          // Idempotency: Prevent duplicate user creation by normalized email
          if (tableName === 'users' && payload.email) {
            const cleanEmail = normalizeEmail(payload.email);
            const existingUser = db.getAllSync('users').find((u: any) => u && u.email && normalizeEmail(u.email) === cleanEmail);
            if (existingUser) {
              const mergedUser = {
                ...existingUser,
                name: payload.name || existingUser.name,
                password_hash: payload.password_hash || existingUser.password_hash,
                avatar_url: payload.avatar_url || existingUser.avatar_url,
                role: payload.role || existingUser.role,
                country: payload.country || existingUser.country,
                updated_at: new Date().toISOString()
              };
              db.set('users', String(existingUser.id), mergedUser);
              return makeThenable({ changes: 1, lastInsertRowid: existingUser.id });
            }
          }

          // Idempotency: Prevent duplicate seller profile creation by user_id or user_email
          if ((tableName === 'seller_profiles' || tableName === 'sellers') && (payload.user_id || payload.user_email)) {
            const existingSp = db.getAllSync('seller_profiles').find((sp: any) => 
              (payload.user_id && String(sp.user_id) === String(payload.user_id)) ||
              (payload.user_email && sp.user_email && normalizeEmail(sp.user_email) === normalizeEmail(payload.user_email))
            );
            if (existingSp) {
              const mergedSp = {
                ...existingSp,
                ...payload,
                id: existingSp.id,
                user_id: existingSp.user_id || payload.user_id,
                updated_at: new Date().toISOString()
              };
              db.set('seller_profiles', String(existingSp.id), mergedSp);
              return makeThenable({ changes: 1, lastInsertRowid: existingSp.id });
            }
          }

          // Idempotency: Prevent duplicate user_kyc rows for the same user_id
          if (tableName === 'user_kyc' && payload.user_id) {
            const existingKyc = db.getAllSync('user_kyc').find((k: any) => k && String(k.user_id) === String(payload.user_id));
            if (existingKyc) {
              const mergedKyc = {
                ...existingKyc,
                ...payload,
                id: existingKyc.id,
                updated_at: new Date().toISOString()
              };
              db.set('user_kyc', String(existingKyc.id), mergedKyc);
              return makeThenable({ changes: 1, lastInsertRowid: existingKyc.id });
            }
          }

          // Idempotency: Prevent duplicate kyc_documents rows for the same user_id and doc_slot
          if (tableName === 'kyc_documents' && payload.user_id && payload.doc_slot) {
            const existingDoc = db.getAllSync('kyc_documents').find((d: any) => 
              d && String(d.user_id) === String(payload.user_id) && String(d.doc_slot).toLowerCase() === String(payload.doc_slot).toLowerCase()
            );
            if (existingDoc) {
              const mergedDoc = {
                ...existingDoc,
                ...payload,
                id: existingDoc.id,
                updated_at: new Date().toISOString()
              };
              db.set('kyc_documents', String(existingDoc.id), mergedDoc);
              return makeThenable({ changes: 1, lastInsertRowid: existingDoc.id });
            }
          }

          const id = payload.id || payload.key || ulid();
          payload.id = String(id);
          db.set(tableName, String(id), payload);
          return makeThenable({ changes: 1, lastInsertRowid: id });
        }

        if (isUpdate) {
          const setMatch = sql.match(/SET\s+([\s\S]+?)\s+WHERE/i);
          const setClause = setMatch ? setMatch[1] : '';
          const whereMatch = sql.match(/WHERE\s+([\s\S]+)$/i);
          const whereClause = whereMatch ? whereMatch[1] : '';

          const assignments = splitSqlTokens(setClause);
          let paramIndex = 0;
          const directUpdates: Record<string, any> = { updated_at: new Date().toISOString() };
          const mathAdjustments: Record<string, { op: '+' | '-' | 'max_minus' | 'max', paramIdx?: number, literalVal?: number }> = {};

          for (const assign of assignments) {
            const parts = assign.split('=');
            if (parts.length >= 2) {
              const col = parts[0].trim().replace(/[`"]/g, '');
              const valExpr = parts.slice(1).join('=').trim();
              if (!col) continue;

              if (/MAX\s*\(\s*0\s*,\s*[a-zA-Z0-9_]+\s*-\s*\?\s*\)/i.test(valExpr)) {
                mathAdjustments[col] = { op: 'max_minus', paramIdx: paramIndex++ };
              } else if (/MAX\s*\(\s*[a-zA-Z0-9_]+\s*,\s*\?\s*\)/i.test(valExpr)) {
                mathAdjustments[col] = { op: 'max', paramIdx: paramIndex++ };
              } else if (/MAX\s*\(\s*[a-zA-Z0-9_]+\s*,\s*(\d+)\s*\)/i.test(valExpr)) {
                const matchNum = valExpr.match(/MAX\s*\(\s*[a-zA-Z0-9_]+\s*,\s*(\d+)\s*\)/i);
                mathAdjustments[col] = { op: 'max', literalVal: Number(matchNum?.[1] || 0) };
              } else if (/\+\s*\?/.test(valExpr)) {
                mathAdjustments[col] = { op: '+', paramIdx: paramIndex++ };
              } else if (/-\s*\?/.test(valExpr)) {
                mathAdjustments[col] = { op: '-', paramIdx: paramIndex++ };
              } else if (/COALESCE/i.test(valExpr)) {
                const qCount = (valExpr.match(/\?/g) || []).length;
                const subParams = params.slice(paramIndex, paramIndex + qCount);
                paramIndex += qCount;
                const validParam = subParams.find(p => p !== undefined && p !== null && p !== '');
                if (validParam !== undefined) {
                  directUpdates[col] = validParam;
                }
              } else if (/^CASE\s+/i.test(valExpr)) {
                const qCount = (valExpr.match(/\?/g) || []).length;
                const caseParams = params.slice(paramIndex, paramIndex + qCount);
                paramIndex += qCount;
                if (caseParams.length > 0 && caseParams[0] !== undefined) {
                  directUpdates[col] = caseParams[0];
                }
              } else if (valExpr === '?') {
                directUpdates[col] = params[paramIndex++];
              } else if (valExpr.toUpperCase() === 'NULL') {
                directUpdates[col] = null;
              } else if (/^(CURRENT_TIMESTAMP|datetime\('now'\))/i.test(valExpr)) {
                directUpdates[col] = new Date().toISOString();
              } else if (valExpr.startsWith("'") && valExpr.endsWith("'")) {
                directUpdates[col] = valExpr.slice(1, -1);
              } else if (!isNaN(Number(valExpr))) {
                directUpdates[col] = Number(valExpr);
              }
            }
          }

          // Remaining params belong to WHERE clause
          const whereParams = params.slice(paramIndex);
          const conditions = parseWhereConditions('WHERE ' + whereClause, whereParams);
          const targetItems = db.getAllSync(tableName, conditions);

          targetItems.forEach((existing: any) => {
            const docId = String(existing.id || existing.key);
            const merged = { ...existing, ...directUpdates };
            for (const [col, math] of Object.entries(mathAdjustments)) {
              const currentVal = Number(existing[col]) || 0;
              const delta = math.paramIdx !== undefined ? (Number(params[math.paramIdx]) || 0) : (math.literalVal || 0);
              if (math.op === '+') {
                merged[col] = currentVal + delta;
              } else if (math.op === '-') {
                merged[col] = currentVal - delta;
              } else if (math.op === 'max_minus') {
                merged[col] = Math.max(0, currentVal - delta);
              } else if (math.op === 'max') {
                merged[col] = Math.max(currentVal, delta);
              }
            }
            db.set(tableName, docId, merged);
          });

          return makeThenable({ changes: targetItems.length });
        }

        return makeThenable({ changes: 0 });
      },

      exec: () => makeThenable(null)
    };
  },

  exec: () => makeThenable(null),
  pragma: () => makeThenable(null)
};

// -----------------------------------------------------------------------------
// 4. Firestore Hydration, Real-Time Listeners & Seeding
// -----------------------------------------------------------------------------
export async function initFirestoreDefaults() {
  try {
    const collectionsToHydrate = [
      'users', 'user_profiles', 'sellers', 'seller_profiles', 'listings', 'products', 
      'orders', 'transactions', 'wallet_transactions', 'ledger_entries', 'system_events', 'payout_methods', 
      'payout_requests', 'user_kyc', 'kyc_submissions', 'kyc_documents', 'kyc_reverification_requests', 'platform_settings', 'audit_logs', 
      'disputes', 'refund_idempotency', 'reviews', 'wishlists', 'cart_items', 'downloads',
      'support_tickets', 'ticket_messages', 'direct_messages', 
      'notifications', 'platform_announcements', 'coupons', 
      'countries', 'country_id_document_types', 'fraud_rules', 
      'fraud_evaluations', 'reconciliation_runs', 'webhook_dead_letter',
      'admin_sessions', 'settlement_batches', 'reserve_holds'
    ];

    const highVolumeCollections = new Set(['system_events', 'audit_logs', 'transactions', 'ledger_entries', 'fraud_evaluations', 'reconciliation_runs', 'media_files']);

    for (const colName of collectionsToHydrate) {
      try {
        let query: any = firestore.collection(colName);
        if (highVolumeCollections.has(colName)) {
          query = query.limit(50);
        } else {
          query = query.limit(100);
        }
        const snap = await query.get();
        const cache = getCollectionCache(colName);
        snap.docs.forEach((d: any) => {
          const data = d.data();
          const key = String(data.id || data.key || d.id);
          if (colName === 'media_files' && data && data.data && typeof data.data === 'string' && data.data.length > 20000) {
            data._dataStripped = true;
            delete data.data;
          }
          cache.set(key, data);
        });
      } catch (err) {
        // collection might be empty or restricted
      }
    }

    const defaults = [
      { key: 'global_commission_rate', value: '0.25' },
      { key: 'platform_wallet_balance', value: '0' },
      { key: 'kyc_sla_hours', value: '72' },
      { key: 'razorpay_enabled', value: '1' },
      { key: 'paypal_enabled', value: '1' },
      { key: 'upi_enabled', value: '1' },
      { key: 'crypto_gw_enabled', value: '1' },
      { key: 'crypto_direct_enabled', value: '1' },
      { key: 'bank_enabled', value: '1' }
    ];

    for (const d of defaults) {
      const existing = await db.get('platform_settings', d.key);
      if (!existing) {
        await db.setSetting(d.key, d.value);
      }
    }

    const existingCountries = await db.getAll('countries');
    const existingCodeMap = new Map<string, any>();
    existingCountries.forEach((c: any) => {
      if (c && c.iso_code) existingCodeMap.set(String(c.iso_code).toUpperCase().trim(), c);
      if (c && c.id) existingCodeMap.set(String(c.id).toUpperCase().trim(), c);
    });

    for (const c of ALL_COUNTRIES_DATA) {
      const code = c.iso_code.toUpperCase().trim();
      const existing = existingCodeMap.get(code);
      if (!existing) {
        await db.set('countries', c.id, c);
      } else if (!existing.phone_code || existing.phone_code !== c.phone_code) {
        await db.set('countries', existing.id || c.id, {
          ...existing,
          name: existing.name || c.name,
          iso_code: existing.iso_code || c.iso_code,
          phone_code: c.phone_code,
          is_active: existing.is_active !== undefined ? existing.is_active : 1
        });
      }
    }

    // Enforce 100% real Firestore-driven data; purge all fake/demo/sample accounts permanently.
    await purgeFakeAndDemoData();

    // Run complete identity & KYC deduplication and foreign-key reconciliation across all collections
    await deduplicateAndReconcileDatabase();

    // Enforce strict allowlisted administrators and sanitize non-admin users in Firestore
    const allUsers = db.getAllSync('users');
    for (const u of allUsers) {
      if (u && u.id) {
        const uEmail = normalizeEmail(u.email);
        const isAllowed = isAllowedAdminEmail(uEmail);
        if (!isAllowed && (u.role === 'admin' || u.role === 'superadmin')) {
          const sp = db.getAllSync('seller_profiles', [{ field: 'user_id', op: '==', value: u.id }]);
          const corrected = sp && sp.length > 0 ? 'seller' : 'user';
          await db.set('users', u.id, { ...u, role: corrected });
        } else if (isAllowed && u.role !== 'admin') {
          await db.set('users', u.id, { ...u, role: 'admin' });
        }
      }
    }

    console.log("🔥 [Firestore] Hydrated primary Cloud Firestore data into memory cache, deduplicated records & synchronized admin allowlist.");
  } catch (err) {
    console.error("Notice: Firestore defaults initialization:", err);
  }
}

/**
 * Deterministic Database Deduplication & Integrity Reconciliation Engine
 * Merges duplicate user accounts by normalized email, re-points all foreign keys
 * in every collection, eliminates duplicate KYC/seller profiles, and cleans up orphans.
 */
export async function deduplicateAndReconcileDatabase(): Promise<{ mergedUsers: number; mergedSellers: number; cleanedDocs: number }> {
  let mergedUsersCount = 0;
  let mergedSellersCount = 0;
  let cleanedDocsCount = 0;

  try {
    const usersCache = getCollectionCache('users');
    const allUsers = Array.from(usersCache.values()).filter(Boolean);

    // 1. DEDUPLICATE USERS BY NORMALIZED EMAIL
    const usersByEmail = new Map<string, any[]>();
    for (const u of allUsers) {
      if (!u || !u.id) continue;
      const emailKey = u.email ? normalizeEmail(u.email) : `_no_email_${u.id}`;
      if (!usersByEmail.has(emailKey)) usersByEmail.set(emailKey, []);
      usersByEmail.get(emailKey)!.push(u);
    }

    const userIdReplacements = new Map<string, string>(); // oldId -> canonicalId

    for (const [emailKey, userGroup] of usersByEmail.entries()) {
      if (userGroup.length > 1 && !emailKey.startsWith('_no_email_')) {
        // Pick canonical user:
        userGroup.sort((a, b) => {
          const aIsAdmin = isAllowedAdminEmail(normalizeEmail(a.email)) || a.role === 'admin' || a.role === 'superadmin';
          const bIsAdmin = isAllowedAdminEmail(normalizeEmail(b.email)) || b.role === 'admin' || b.role === 'superadmin';
          if (aIsAdmin && !bIsAdmin) return -1;
          if (!aIsAdmin && bIsAdmin) return 1;

          const aVerified = Number(a.is_verified) === 1 ? 1 : 0;
          const bVerified = Number(b.is_verified) === 1 ? 1 : 0;
          if (aVerified !== bVerified) return bVerified - aVerified;

          const aDate = new Date(a.created_at || 0).getTime();
          const bDate = new Date(b.created_at || 0).getTime();
          return aDate - bDate; // oldest first
        });

        const canonical = userGroup[0];
        const duplicates = userGroup.slice(1);

        for (const dup of duplicates) {
          const dupId = String(dup.id);
          const canonicalId = String(canonical.id);
          userIdReplacements.set(dupId, canonicalId);

          // Merge non-empty fields into canonical
          if (!canonical.password_hash && dup.password_hash) canonical.password_hash = dup.password_hash;
          if ((!canonical.name || canonical.name === 'User') && dup.name && dup.name !== 'User') canonical.name = dup.name;
          if (!canonical.avatar_url && dup.avatar_url) canonical.avatar_url = dup.avatar_url;
          if (Number(dup.is_verified) === 1) canonical.is_verified = 1;
          if (dup.phone && !canonical.phone) canonical.phone = dup.phone;
          if (dup.phone_number && !canonical.phone_number) canonical.phone_number = dup.phone_number;
          if (dup.country && !canonical.country) canonical.country = dup.country;
          if (dup.username && !canonical.username) canonical.username = dup.username;

          // Delete duplicate user from cache and Firestore
          usersCache.delete(dupId);
          try {
            await firestore.collection('users').doc(dupId).delete();
          } catch (e) {}
          mergedUsersCount++;
        }

        canonical.updated_at = new Date().toISOString();
        usersCache.set(String(canonical.id), canonical);
        try {
          await firestore.collection('users').doc(String(canonical.id)).set(canonical, { merge: true });
        } catch (e) {}
      }
    }

    // 2. RE-POINT FOREIGN KEYS ACROSS ALL RELEVANT COLLECTIONS
    if (userIdReplacements.size > 0) {
      const collectionsToRePoint = [
        { col: 'orders', userFields: ['buyer_id'] },
        { col: 'transactions', userFields: ['seller_id', 'buyer_id', 'user_id'] },
        { col: 'listings', userFields: ['seller_id', 'user_id'] },
        { col: 'seller_profiles', userFields: ['user_id'] },
        { col: 'user_kyc', userFields: ['user_id'] },
        { col: 'kyc_documents', userFields: ['user_id'] },
        { col: 'kyc_reverification_requests', userFields: ['seller_id', 'user_id'] },
        { col: 'payout_methods', userFields: ['user_id'] },
        { col: 'payout_requests', userFields: ['user_id', 'seller_id'] },
        { col: 'support_tickets', userFields: ['user_id'] },
        { col: 'ticket_messages', userFields: ['user_id', 'sender_id'] },
        { col: 'direct_messages', userFields: ['sender_id', 'recipient_id', 'user_id'] },
        { col: 'notifications', userFields: ['user_id'] },
        { col: 'reviews', userFields: ['user_id', 'seller_id'] },
        { col: 'audit_logs', userFields: ['user_id', 'admin_id', 'target', 'target_id'] },
        { col: 'admin_sessions', userFields: ['user_id'] },
        { col: 'wallet_transactions', userFields: ['user_id'] }
      ];

      for (const { col, userFields } of collectionsToRePoint) {
        const cache = getCollectionCache(col);
        for (const [docId, item] of cache.entries()) {
          if (!item) continue;
          let changed = false;
          for (const field of userFields) {
            if (item[field] && userIdReplacements.has(String(item[field]))) {
              item[field] = userIdReplacements.get(String(item[field]));
              changed = true;
            }
          }
          if (changed) {
            cache.set(docId, item);
            try {
              await firestore.collection(col).doc(docId).set(item, { merge: true });
            } catch (e) {}
          }
        }
      }
    }

    // 3. DEDUPLICATE SELLER PROFILES & KYC APPLICATIONS
    const spCache = getCollectionCache('seller_profiles');
    const allSps = Array.from(spCache.values()).filter(Boolean);

    // Link orphaned seller profiles to users by matching email or display_name
    const currentUsers = Array.from(usersCache.values()).filter(Boolean);
    const userByEmailMap = new Map<string, any>();
    const userByNameMap = new Map<string, any>();
    for (const u of currentUsers) {
      if (u.email) userByEmailMap.set(normalizeEmail(u.email), u);
      if (u.name) userByNameMap.set(String(u.name).toLowerCase().trim(), u);
    }

    for (const sp of allSps) {
      if (!sp || !sp.id) continue;
      const spEmail = sp.user_email ? normalizeEmail(sp.user_email) : '';
      if (spEmail && userByEmailMap.has(spEmail)) {
        sp.user_id = userByEmailMap.get(spEmail).id;
      } else if (sp.user_id && !usersCache.has(String(sp.user_id))) {
        // User ID is orphaned; try matching by name
        const nameKey = (sp.full_legal_name || sp.display_name || '').toLowerCase().trim();
        if (nameKey && userByNameMap.has(nameKey)) {
          sp.user_id = userByNameMap.get(nameKey).id;
        }
      }
    }

    // Group seller profiles by canonical user_id
    const spByUserId = new Map<string, any[]>();
    for (const sp of allSps) {
      if (!sp || !sp.id) continue;
      const uid = String(sp.user_id || sp.id);
      if (!spByUserId.has(uid)) spByUserId.set(uid, []);
      spByUserId.get(uid)!.push(sp);
    }

    for (const [uid, profiles] of spByUserId.entries()) {
      // If user does not exist in usersCache AND profile is an empty orphaned test record, delete it
      if (!usersCache.has(uid) && profiles.length === 1 && !profiles[0].user_email && !profiles[0].bank_name && !profiles[0].pan_number && !profiles[0].tax_id) {
        spCache.delete(String(profiles[0].id));
        try {
          await firestore.collection('seller_profiles').doc(String(profiles[0].id)).delete();
          await firestore.collection('sellers').doc(String(profiles[0].id)).delete();
        } catch (e) {}
        continue;
      }

      if (profiles.length > 1) {
        profiles.sort((a, b) => {
          const aVerified = ['verified', 'approved'].includes(String(a.kyc_status || '').toLowerCase()) ? 1 : 0;
          const bVerified = ['verified', 'approved'].includes(String(b.kyc_status || '').toLowerCase()) ? 1 : 0;
          if (aVerified !== bVerified) return bVerified - aVerified;

          const aHasBank = a.account_number || a.bank_name || a.upi_id ? 1 : 0;
          const bHasBank = b.account_number || b.bank_name || b.upi_id ? 1 : 0;
          if (aHasBank !== bHasBank) return bHasBank - aHasBank;

          const aDate = new Date(a.updated_at || a.kyc_submitted_at || a.created_at || 0).getTime();
          const bDate = new Date(b.updated_at || b.kyc_submitted_at || b.created_at || 0).getTime();
          return bDate - aDate; // newest first
        });

        const canonicalSp = profiles[0];
        const duplicateSps = profiles.slice(1);

        for (const dup of duplicateSps) {
          const dupId = String(dup.id);
          // Merge non-empty fields into canonicalSp
          for (const key of Object.keys(dup)) {
            if (dup[key] !== null && dup[key] !== undefined && dup[key] !== '' && (canonicalSp[key] === null || canonicalSp[key] === undefined || canonicalSp[key] === '')) {
              canonicalSp[key] = dup[key];
            }
          }

          spCache.delete(dupId);
          try {
            await firestore.collection('seller_profiles').doc(dupId).delete();
            await firestore.collection('sellers').doc(dupId).delete();
          } catch (e) {}
          mergedSellersCount++;
        }

        canonicalSp.updated_at = new Date().toISOString();
        spCache.set(String(canonicalSp.id), canonicalSp);
        try {
          await firestore.collection('seller_profiles').doc(String(canonicalSp.id)).set(canonicalSp, { merge: true });
        } catch (e) {}
      }
    }

    // 4. DEDUPLICATE KYC DOCUMENTS PER USER PER SLOT
    const kycDocsCache = getCollectionCache('kyc_documents');
    const allDocs = Array.from(kycDocsCache.values()).filter(Boolean);
    const docsByUserAndSlot = new Map<string, any[]>();

    for (const doc of allDocs) {
      if (!doc || !doc.id) continue;
      const slotKey = `${doc.user_id || 'unknown'}_${String(doc.doc_slot || 'front').toLowerCase()}`;
      if (!docsByUserAndSlot.has(slotKey)) docsByUserAndSlot.set(slotKey, []);
      docsByUserAndSlot.get(slotKey)!.push(doc);
    }

    for (const [slotKey, docs] of docsByUserAndSlot.entries()) {
      if (docs.length > 1) {
        docs.sort((a, b) => {
          const aVerified = a.status === 'VERIFIED' ? 1 : 0;
          const bVerified = b.status === 'VERIFIED' ? 1 : 0;
          if (aVerified !== bVerified) return bVerified - aVerified;
          const aDate = new Date(a.uploaded_at || a.created_at || 0).getTime();
          const bDate = new Date(b.uploaded_at || b.created_at || 0).getTime();
          return bDate - aDate;
        });

        const canonicalDoc = docs[0];
        const dupDocs = docs.slice(1);

        for (const dup of dupDocs) {
          kycDocsCache.delete(String(dup.id));
          try {
            await firestore.collection('kyc_documents').doc(String(dup.id)).delete();
          } catch (e) {}
          cleanedDocsCount++;
        }
      }
    }

    // 5. DEDUPLICATE USER_KYC PER USER
    const userKycCache = getCollectionCache('user_kyc');
    const allUserKyc = Array.from(userKycCache.values()).filter(Boolean);
    const userKycByUser = new Map<string, any[]>();
    for (const k of allUserKyc) {
      if (!k || !k.id) continue;
      const uid = String(k.user_id || k.id);
      if (!userKycByUser.has(uid)) userKycByUser.set(uid, []);
      userKycByUser.get(uid)!.push(k);
    }

    for (const [uid, kycs] of userKycByUser.entries()) {
      if (kycs.length > 1) {
        kycs.sort((a, b) => {
          const aDate = new Date(a.updated_at || a.created_at || 0).getTime();
          const bDate = new Date(b.updated_at || b.created_at || 0).getTime();
          return bDate - aDate;
        });
        const canonicalKyc = kycs[0];
        const dupKycs = kycs.slice(1);
        for (const dup of dupKycs) {
          userKycCache.delete(String(dup.id));
          try {
            await firestore.collection('user_kyc').doc(String(dup.id)).delete();
          } catch (e) {}
        }
      }
    }

    console.log(`✨ [Database Deduplication & Reconciliation] Done. Merged Users: ${mergedUsersCount}, Merged Seller Profiles: ${mergedSellersCount}, Cleaned Duplicate Docs: ${cleanedDocsCount}`);
  } catch (err) {
    console.error("⚠️ [Database Deduplication & Reconciliation] Notice:", err);
  }

  return { mergedUsers: mergedUsersCount, mergedSellers: mergedSellersCount, cleanedDocs: cleanedDocsCount };
}

/**
 * 100% Real User Enforcement & Fake Data Purge
 * Removes any synthetic/demo users (e.g. example.com, test_ accounts, QuantAI Store, Alex Mercer)
 * and all their related listings, orders, and secondary records from Firestore and memory cache.
 */
export async function purgeFakeAndDemoData(): Promise<{ deletedUsers: number; deletedSellers: number; deletedListings: number; deletedOthers: number }> {
  let deletedUsers = 0;
  let deletedSellers = 0;
  let deletedListings = 0;
  let deletedOthers = 0;

  try {
    const usersCache = getCollectionCache('users');
    const allUsers = Array.from(usersCache.values()).filter(Boolean);

    const isFakeUser = (u: any) => {
      if (!u) return false;
      const em = String(u.email || '').toLowerCase().trim();
      const name = String(u.name || '').toLowerCase().trim();
      const id = String(u.id || '').toLowerCase().trim();

      // Check for example.com emails or test email patterns
      if (em.includes('@example.com') || em.endsWith('.example.com')) return true;
      if (em.startsWith('test_') || em.startsWith('buyer_17') || em.startsWith('seller_17')) return true;
      if (id.startsWith('test_seller_') || id.startsWith('test_user_')) return true;
      if (id === '01m1grw0ty256x6qp6tk8cqbvs' || id === '01m1grw0yet0n7xdmzw33kdg5r') return true;
      if (['quantai store', 'alex mercer', 'test seller store', 'test user'].includes(name) && (em.includes('example.com') || id.includes('test_') || id.includes('01m1grw0'))) return true;

      return false;
    };

    const fakeUserIds = new Set<string>();

    for (const u of allUsers) {
      if (isFakeUser(u)) {
        const uid = String(u.id);
        fakeUserIds.add(uid);
        usersCache.delete(uid);
        try {
          await firestore.collection('users').doc(uid).delete();
        } catch (e) {}
        deletedUsers++;
      }
    }

    // 2. Remove fake sellers / seller profiles
    const spCache = getCollectionCache('seller_profiles');
    const sellersCache = getCollectionCache('sellers');
    for (const sp of Array.from(spCache.values()).filter(Boolean)) {
      const spId = String(sp.id);
      const uid = String(sp.user_id || sp.id);
      const em = String(sp.user_email || sp.email || '').toLowerCase();
      const name = String(sp.display_name || sp.full_legal_name || '').toLowerCase();

      if (fakeUserIds.has(uid) || fakeUserIds.has(spId) || em.includes('example.com') || name.includes('quantai') || name.includes('test seller') || spId.startsWith('test_seller_') || spId.toLowerCase().includes('01m1grw12dm')) {
        fakeUserIds.add(uid);
        fakeUserIds.add(spId);
        spCache.delete(spId);
        sellersCache.delete(spId);
        try {
          await firestore.collection('seller_profiles').doc(spId).delete();
          await firestore.collection('sellers').doc(spId).delete();
        } catch (e) {}
        deletedSellers++;
      }
    }

    // 3. Remove fake listings / products
    const listCache = getCollectionCache('listings');
    const prodCache = getCollectionCache('products');
    for (const l of Array.from(listCache.values()).filter(Boolean)) {
      const lId = String(l.id);
      const sId = String(l.seller_id || l.user_id);
      const title = String(l.title || '').toLowerCase();

      if (fakeUserIds.has(sId) || lId.toLowerCase().startsWith('prod_01m1grtb') || title.includes('cyberpunk ui kit pro')) {
        listCache.delete(lId);
        prodCache.delete(lId);
        try {
          await firestore.collection('listings').doc(lId).delete();
          await firestore.collection('products').doc(lId).delete();
        } catch (e) {}
        deletedListings++;
      }
    }

    // 4. Remove fake orders, transactions, payouts, tickets, messages
    const otherCols = [
      { col: 'orders', idFields: ['buyer_id', 'seller_id', 'user_id'] },
      { col: 'transactions', idFields: ['buyer_id', 'seller_id', 'user_id'] },
      { col: 'payout_requests', idFields: ['user_id', 'seller_id'] },
      { col: 'support_tickets', idFields: ['user_id'] },
      { col: 'ticket_messages', idFields: ['user_id', 'sender_id'] },
      { col: 'direct_messages', idFields: ['user_id', 'sender_id', 'recipient_id'] },
      { col: 'user_kyc', idFields: ['user_id'] },
      { col: 'kyc_documents', idFields: ['user_id'] }
    ];

    for (const { col, idFields } of otherCols) {
      const cache = getCollectionCache(col);
      for (const item of Array.from(cache.values()).filter(Boolean)) {
        const itemId = String(item.id);
        const isMatch = idFields.some(f => item[f] && fakeUserIds.has(String(item[f]))) || 
                        itemId.toLowerCase().startsWith('ord_01m1gr') || 
                        itemId.toLowerCase().startsWith('po_01m1gr') || 
                        itemId.toLowerCase().startsWith('tick_01m1gr') || 
                        itemId.toLowerCase().startsWith('msg_01m1gr');
        if (isMatch) {
          cache.delete(itemId);
          try {
            await firestore.collection(col).doc(itemId).delete();
          } catch (e) {}
          deletedOthers++;
        }
      }
    }

    console.log(`🧹 [Fake & Demo Data Cleanup] Purged ${deletedUsers} fake users, ${deletedSellers} fake seller profiles, ${deletedListings} fake listings, ${deletedOthers} secondary test docs.`);
  } catch (err) {
    console.error("⚠️ [Fake Data Cleanup] Error:", err);
  }

  return { deletedUsers, deletedSellers, deletedListings, deletedOthers };
}

export default db;
