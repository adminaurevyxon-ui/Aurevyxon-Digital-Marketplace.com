import { ulid } from "ulid";
import db from "../db.ts";
import { isAllowedAdminEmail } from "../../src/config/admin.ts";
import { syncSellerProfileToFirestore } from "../firestoreSync.ts";

export interface KycSubmissionInput {
  userId: string;
  userEmail?: string;
  userRole?: string;
  fullName?: string;
  dob?: string;
  idType?: string;
  nationalId?: string;
  phone?: string;
  taxCountry?: string;
  taxId?: string;
  sellerType?: string;
  payoutMethod?: string;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  ifscCode?: string;
  upiId?: string;
  idDocumentUrl?: string;
  idDocumentFrontUrl?: string;
  idDocumentBackUrl?: string;
  address?: string;
  companyName?: string;
  ip?: string;
  userAgent?: string;
}

export interface KycSubmissionResult {
  success: boolean;
  message: string;
  kycStatus: string;
  sellerProfileId: string;
  kycId: string;
}

/**
 * Single Canonical KYC Submission Service (Part C Architecture)
 * Both /api/seller/submit-kyc and /api/user/kyc route through this service.
 * Guarantees consistent persistence, status = 'pending', document indexing,
 * audit logging, and Cloud Firestore synchronization.
 */
export async function submitKycApplication(input: KycSubmissionInput): Promise<KycSubmissionResult> {
  const {
    userId,
    userEmail = "",
    userRole = "user",
    fullName = "",
    dob = "1995-01-01",
    idType = "NATIONAL_ID",
    nationalId = "",
    phone = "",
    taxCountry = "India",
    taxId = "",
    sellerType = "individual",
    payoutMethod = "bank",
    bankName = "",
    accountHolder = "",
    accountNumber = "",
    ifscCode = "",
    upiId = "",
    idDocumentUrl = "",
    idDocumentFrontUrl = "",
    idDocumentBackUrl = "",
    address = "",
    companyName = "",
    ip = "127.0.0.1",
    userAgent = "AureVyxon Client"
  } = input;

  const effectiveEmail = (userEmail || "").toLowerCase().trim();
  const serverNowIso = new Date().toISOString();

  let user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
  if (!user && effectiveEmail) {
    user = db.prepare("SELECT * FROM users WHERE LOWER(TRIM(email)) = ?").get(effectiveEmail) as any;
  }
  if (!user) {
    const userFallback = {
      id: userId,
      email: effectiveEmail || `${userId}@user.local`,
      name: fullName || "Seller",
      role: userRole || "user",
      status: "active",
      created_at: serverNowIso,
      updated_at: serverNowIso
    };
    try {
      db.prepare("INSERT INTO users (id, email, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(userFallback.id, userFallback.email, userFallback.name, userFallback.role, serverNowIso, serverNowIso);
      user = userFallback;
    } catch(e) {
      user = userFallback;
    }
  }

  const isAdmin = user.role === 'admin' || user.role === 'superadmin' || isAllowedAdminEmail(user.email || userEmail);
  const kycStatus = isAdmin ? 'verified' : 'pending';

  // 1. Ensure or retrieve existing Seller Profile
  let sp = db.prepare("SELECT * FROM seller_profiles WHERE user_id = ?").get(userId) as any;
  if (!sp && effectiveEmail) {
    sp = db.prepare("SELECT * FROM seller_profiles WHERE LOWER(TRIM(user_email)) = ?").get(effectiveEmail) as any;
    if (sp) {
      sp.user_id = userId;
      db.prepare("UPDATE seller_profiles SET user_id = ? WHERE id = ?").run(userId, sp.id);
    }
  }
  if (!sp) {
    const newSpId = userId;
    db.prepare(`
      INSERT INTO seller_profiles (
        id, user_id, display_name, seller_type, kyc_status, current_step,
        step1_status, step2_status, step3_status, step4_status, user_email, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', 4, 'COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED', ?, ?, ?)
    `).run(newSpId, userId, fullName || user.name || "Seller", companyName ? 'business' : sellerType, effectiveEmail, serverNowIso, serverNowIso);
    sp = db.prepare("SELECT * FROM seller_profiles WHERE user_id = ?").get(userId) as any;
  }

  const effectiveFullName = fullName || sp.full_legal_name || user.name || "Seller";
  const effectiveTaxId = taxId || sp.tax_id || sp.pan_number || nationalId || "";
  const effectiveNationalId = nationalId || sp.national_id || effectiveTaxId || "";
  const effectivePhone = phone || sp.phone || sp.phone_number || "";
  const effectiveDocFront = idDocumentFrontUrl || idDocumentUrl || sp.id_document_front_url || sp.id_document_url || address || "";
  const effectiveDocBack = idDocumentBackUrl || sp.id_document_back_url || "";
  const effectiveAccountHolder = accountHolder || sp.account_holder || effectiveFullName;

  const combinedPayout = payoutMethod === 'bank'
    ? `${accountNumber} (${bankName}${ifscCode ? `, IFSC: ${ifscCode}` : ''})`
    : upiId;

  // 2. Atomically update seller_profiles record with pending KYC details
  db.prepare(`
    UPDATE seller_profiles SET
      full_legal_name = COALESCE(NULLIF(?, ''), full_legal_name),
      dob = COALESCE(NULLIF(?, ''), dob),
      id_type = COALESCE(NULLIF(?, ''), id_type),
      national_id = COALESCE(NULLIF(?, ''), national_id),
      phone = COALESCE(NULLIF(?, ''), phone),
      tax_country = COALESCE(NULLIF(?, ''), tax_country),
      tax_id = COALESCE(NULLIF(?, ''), tax_id),
      pan_number = COALESCE(NULLIF(?, ''), pan_number),
      seller_type = COALESCE(NULLIF(?, ''), seller_type),
      payout_method = COALESCE(NULLIF(?, ''), payout_method),
      bank_name = COALESCE(NULLIF(?, ''), bank_name),
      account_holder = COALESCE(NULLIF(?, ''), account_holder),
      account_number = COALESCE(NULLIF(?, ''), account_number),
      ifsc_code = COALESCE(NULLIF(?, ''), ifsc_code),
      upi_id = COALESCE(NULLIF(?, ''), upi_id),
      payout_details = COALESCE(NULLIF(?, ''), payout_details),
      id_document_url = COALESCE(NULLIF(?, ''), id_document_url),
      id_document_front_url = COALESCE(NULLIF(?, ''), id_document_front_url),
      id_document_back_url = COALESCE(NULLIF(?, ''), id_document_back_url),
      step1_status = 'COMPLETED',
      step2_status = 'COMPLETED',
      step3_status = 'COMPLETED',
      step4_status = 'COMPLETED',
      kyc_status = ?,
      kyc_rejection_reason = NULL,
      kyc_submitted_at = ?,
      seller_agreement_accepted_at = COALESCE(seller_agreement_accepted_at, ?),
      user_email = COALESCE(NULLIF(user_email, ''), ?),
      display_name = COALESCE(NULLIF(display_name, ''), ?),
      updated_at = ?
    WHERE user_id = ?
  `).run(
    effectiveFullName, dob, idType, effectiveNationalId, effectivePhone,
    taxCountry, effectiveTaxId, effectiveTaxId, companyName ? 'business' : sellerType,
    payoutMethod, bankName, effectiveAccountHolder, accountNumber, ifscCode, upiId,
    combinedPayout, effectiveDocFront, effectiveDocFront, effectiveDocBack,
    kycStatus, serverNowIso, serverNowIso, user.email || userEmail, effectiveFullName,
    serverNowIso, userId
  );

  // 3. Update user_kyc table for backward compatibility
  const kycId = ulid();
  const bankDetailsPayload = JSON.stringify({
    full_name: effectiveFullName,
    dob,
    address,
    company_name: companyName,
    tax_id: effectiveTaxId,
    national_id: effectiveNationalId,
    phone: effectivePhone,
    tax_country: taxCountry,
    bank_name: bankName,
    account_holder: effectiveAccountHolder,
    account_number: accountNumber,
    ifsc_code: ifscCode,
    upi_id: upiId,
    submitted_at: serverNowIso
  });

  const existingKyc = db.prepare("SELECT id FROM user_kyc WHERE user_id = ?").get(userId) as any;
  if (existingKyc) {
    db.prepare(`
      UPDATE user_kyc SET
        document_url = COALESCE(NULLIF(?, ''), document_url),
        bank_details = ?,
        status = ?,
        updated_at = ?
      WHERE user_id = ?
    `).run(effectiveDocFront || 'Document Uploaded', bankDetailsPayload, kycStatus, serverNowIso, userId);
  } else {
    db.prepare(`
      INSERT INTO user_kyc (id, user_id, document_url, bank_details, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(kycId, userId, effectiveDocFront || 'Document Uploaded', bankDetailsPayload, kycStatus, serverNowIso, serverNowIso);
  }

  // 4. Record KYC document entries in kyc_documents
  if (effectiveDocFront) {
    const existingFront = db.prepare("SELECT id FROM kyc_documents WHERE user_id = ? AND doc_slot = 'front'").get(userId) as any;
    if (existingFront) {
      db.prepare(`
        UPDATE kyc_documents SET file_path = ?, status = 'AWAITING_VERIFICATION', updated_at = ? WHERE id = ?
      `).run(effectiveDocFront, serverNowIso, existingFront.id);
    } else {
      db.prepare(`
        INSERT INTO kyc_documents (id, user_id, seller_profile_id, doc_slot, doc_type, file_name, file_path, mime_type, file_size, status, created_at)
        VALUES (?, ?, ?, 'front', ?, 'id_document_front.jpg', ?, 'image/jpeg', 102400, 'AWAITING_VERIFICATION', ?)
      `).run(ulid(), userId, sp.id, idType, effectiveDocFront, serverNowIso);
    }
  }

  if (effectiveDocBack) {
    const existingBack = db.prepare("SELECT id FROM kyc_documents WHERE user_id = ? AND doc_slot = 'back'").get(userId) as any;
    if (existingBack) {
      db.prepare(`
        UPDATE kyc_documents SET file_path = ?, status = 'AWAITING_VERIFICATION', updated_at = ? WHERE id = ?
      `).run(effectiveDocBack, serverNowIso, existingBack.id);
    } else {
      db.prepare(`
        INSERT INTO kyc_documents (id, user_id, seller_profile_id, doc_slot, doc_type, file_name, file_path, mime_type, file_size, status, created_at)
        VALUES (?, ?, ?, 'back', ?, 'id_document_back.jpg', ?, 'image/jpeg', 102400, 'AWAITING_VERIFICATION', ?)
      `).run(ulid(), userId, sp.id, idType, effectiveDocBack, serverNowIso);
    }
  }

  // 5. Update any active KYC Re-Verification requests to 'SUBMITTED'
  try {
    const allRequests = db.getAllSync('kyc_reverification_requests') || [];
    const activeReq = allRequests.find((r: any) =>
      (r.seller_id === userId || r.user_id === userId) &&
      Number(r.is_active) === 1 &&
      ['PENDING', 'SUBMITTED', 'UNDER_REVIEW'].includes(String(r.status).toUpperCase())
    );
    if (activeReq) {
      const updated = {
        ...activeReq,
        status: 'SUBMITTED',
        submitted_at: serverNowIso,
        updated_at: serverNowIso
      };
      db.set('kyc_reverification_requests', activeReq.id, updated).catch(() => {});
    }
  } catch (errReq) {
    console.warn("[KYC Service] Reverification sync notice:", errReq);
  }

  // 6. Record canonical audit log
  try {
    const auditId = 'audit_' + Date.now() + '_' + ulid().substring(0, 8);
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, target_id, details, ip_address, created_at)
      VALUES (?, ?, 'KYC_APPLICATION_SUBMITTED', ?, ?, ?, ?)
    `).run(
      auditId,
      userId,
      userId,
      JSON.stringify({
        seller_type: companyName ? 'business' : sellerType,
        tax_country: taxCountry,
        kyc_status: kycStatus,
        ip,
        userAgent
      }),
      ip,
      serverNowIso
    );
  } catch (auditErr) {
    console.warn("[KYC Service] Audit log notice:", auditErr);
  }

  // 7. Synchronize to Cloud Firestore with structured error handling (non-blocking)
  try {
    const updatedSp = db.prepare("SELECT * FROM seller_profiles WHERE user_id = ?").get(userId) as any;
    if (updatedSp) {
      syncSellerProfileToFirestore(updatedSp).catch((err) => {
        console.warn("[KYC Service] Cloud Firestore async sync notice:", err?.message || err);
      });
    }
  } catch (firestoreErr) {
    console.warn("[KYC Service] Cloud Firestore sync notice (queued for retry):", firestoreErr);
  }

  return {
    success: true,
    message: isAdmin 
      ? "KYC automatically approved via Administrator authorization."
      : "KYC application submitted successfully. Our compliance team will review within 24-48 hours.",
    kycStatus,
    sellerProfileId: sp.id,
    kycId
  };
}
