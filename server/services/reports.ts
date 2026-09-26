import db from '../db.ts';

export class AccountingReports {

  static async generatePLReport(startDate: string, endDate: string) {
    const revenueEntries = await db.getAll('ledger_entries', [
      { field: 'account_id', op: '==', value: 'Platform_Revenue' },
      { field: 'entry_type', op: '==', value: 'credit' }
    ]);

    const expenseEntries = await db.getAll('ledger_entries', [
      { field: 'account_id', op: '==', value: 'Operating_Expenses' },
      { field: 'entry_type', op: '==', value: 'debit' }
    ]);

    const totalRevenue = revenueEntries
      .filter(e => !startDate || (e.created_at >= startDate && e.created_at <= endDate))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const totalExpenses = expenseEntries
      .filter(e => !startDate || (e.created_at >= startDate && e.created_at <= endDate))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    return {
      period: { startDate, endDate },
      total_revenue: totalRevenue,
      total_expenses: totalExpenses,
      net_profit: totalRevenue - totalExpenses
    };
  }

  static async generateTDSReport(startDate: string, endDate: string) {
    const tdsEntries = await db.getAll('ledger_entries', [
      { field: 'account_id', op: '==', value: 'TDS_Payable' },
      { field: 'entry_type', op: '==', value: 'credit' }
    ]);

    const totalTds = tdsEntries
      .filter(e => !startDate || (e.created_at >= startDate && e.created_at <= endDate))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    return {
      period: { startDate, endDate },
      total_tds_collected: totalTds
    };
  }

  static async generateSellerSettlementReport(sellerId: string, startDate: string, endDate: string) {
    const accountId = `Seller_Payable_${sellerId}`;
    
    const credits = await db.getAll('ledger_entries', [
      { field: 'account_id', op: '==', value: accountId },
      { field: 'entry_type', op: '==', value: 'credit' }
    ]);

    const debits = await db.getAll('ledger_entries', [
      { field: 'account_id', op: '==', value: accountId },
      { field: 'entry_type', op: '==', value: 'debit' }
    ]);

    const totalCredits = credits
      .filter(e => !startDate || (e.created_at >= startDate && e.created_at <= endDate))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const totalDebits = debits
      .filter(e => !startDate || (e.created_at >= startDate && e.created_at <= endDate))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    return {
      sellerId,
      period: { startDate, endDate },
      total_earnings_credited: totalCredits,
      total_payouts_debited: totalDebits
    };
  }
}
