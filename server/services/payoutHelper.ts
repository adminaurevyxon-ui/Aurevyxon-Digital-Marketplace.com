// ============================================================================
// Payout & Banking Verification Helper (IFSC, UPI, Masking & SLA Engine)
// ============================================================================

export const KNOWN_IFSC_BANKS: Record<string, string> = {
  'SBIN': 'State Bank of India',
  'HDFC': 'HDFC Bank',
  'ICIC': 'ICICI Bank',
  'UTIB': 'Axis Bank',
  'BARB': 'Bank of Baroda',
  'PUNB': 'Punjab National Bank',
  'KKBK': 'Kotak Mahindra Bank',
  'YESB': 'Yes Bank',
  'IDIB': 'Indian Bank',
  'CNRB': 'Canara Bank',
  'UBIN': 'Union Bank of India',
  'IOBA': 'Indian Overseas Bank',
  'MAHB': 'Bank of Maharashtra',
  'INDB': 'IndusInd Bank',
  'FDRL': 'Federal Bank',
  'IDFB': 'IDFC First Bank',
  'BKID': 'Bank of India',
  'CBIN': 'Central Bank of India',
  'PSIB': 'Punjab & Sind Bank',
  'UCOB': 'UCO Bank',
  'KVBL': 'Karur Vysya Bank',
  'SIBL': 'South Indian Bank',
  'RATN': 'RBL Bank',
  'CSBK': 'CSB Bank',
  'TMBL': 'Tamilnad Mercantile Bank',
  'DCBL': 'DCB Bank',
  'CITI': 'Citibank India',
  'HSBC': 'HSBC Bank India',
  'SCBL': 'Standard Chartered Bank',
  'DBSS': 'DBS Bank India',
  'AUBL': 'AU Small Finance Bank',
  'ESFB': 'Equitas Small Finance Bank',
  'JSFB': 'Jana Small Finance Bank',
  'AIRP': 'Airtel Payments Bank',
  'PYTM': 'Paytm Payments Bank',
  'IPOS': 'India Post Payments Bank',
  'FINO': 'Fino Payments Bank'
};

/**
 * Validates UPI ID format: username@handle
 * Example: john.doe@okaxis, merchant99@paytm, user@oksbi
 */
export function validateUPI(upiId: string): { valid: boolean; error?: string; cleanUpi?: string } {
  if (!upiId || typeof upiId !== 'string') {
    return { valid: false, error: 'UPI ID is required' };
  }
  const clean = upiId.trim().toLowerCase();
  const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/;
  if (!upiRegex.test(clean)) {
    return { valid: false, error: 'Invalid UPI ID format. Standard pattern: yourname@bankhandle' };
  }
  return { valid: true, cleanUpi: clean };
}

/**
 * Validates IFSC format: 11 characters (4 letters, 0, 6 letters/digits)
 * Example: HDFC0001234, SBIN0000456
 */
export function validateIFSC(ifsc: string): { valid: boolean; error?: string; bankName?: string; cleanIfsc?: string } {
  if (!ifsc || typeof ifsc !== 'string') {
    return { valid: false, error: 'IFSC code is required' };
  }
  const clean = ifsc.trim().toUpperCase();
  const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  if (!ifscRegex.test(clean)) {
    return { valid: false, error: 'Invalid IFSC format. Must be 11 characters (e.g. HDFC0001234)' };
  }
  const prefix = clean.substring(0, 4);
  const bankName = KNOWN_IFSC_BANKS[prefix] || `${prefix} Bank`;
  return { valid: true, bankName, cleanIfsc: clean };
}

/**
 * Validates Bank Account Number: 8 to 18 digits
 */
export function validateAccountNumber(accNum: string): { valid: boolean; error?: string; cleanAccount?: string } {
  if (!accNum || typeof accNum !== 'string') {
    return { valid: false, error: 'Account number is required' };
  }
  const clean = accNum.trim().replace(/\s+/g, '');
  const accRegex = /^\d{8,18}$/;
  if (!accRegex.test(clean)) {
    return { valid: false, error: 'Invalid account number. Must contain 8 to 18 digits.' };
  }
  return { valid: true, cleanAccount: clean };
}

/**
 * Masks UPI ID for safe visual display
 * e.g. "jagannathsingh@okhdfcbank" -> "j••••••••h@okhdfcbank"
 */
export function maskUPI(upiId: string): string {
  if (!upiId) return '';
  const parts = upiId.split('@');
  if (parts.length !== 2) return upiId;
  const user = parts[0];
  const handle = parts[1];
  if (user.length <= 2) {
    return `${user[0] || ''}*@${handle}`;
  }
  const first = user[0];
  const last = user[user.length - 1];
  return `${first}••••${last}@${handle}`;
}

/**
 * Masks Bank Account Number for safe visual display
 * e.g. "123456789012" -> "••••••••9012"
 */
export function maskAccountNumber(accNum: string): string {
  if (!accNum) return '';
  const clean = accNum.replace(/\s+/g, '');
  if (clean.length < 4) return '••••' + clean;
  return '••••••••' + clean.slice(-4);
}

/**
 * Formats a clean masked summary string for payout requests
 */
export function formatMaskedSummary(methodType: string, details: any): string {
  if (methodType === 'upi') {
    const upi = details.upi_id || details.upiId || details.payout_details || '';
    return `UPI: ${maskUPI(upi)}`;
  }
  if (methodType === 'bank') {
    const bank = details.bank_name || details.bankName || 'Bank Account';
    const acc = details.account_number || details.accountNumber || details.payout_details || '';
    return `${bank} (${maskAccountNumber(acc)})`;
  }
  return details.payout_details || methodType;
}
