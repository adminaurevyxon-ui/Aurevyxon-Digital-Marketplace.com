import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { Search, RefreshCw, DollarSign, ArrowUpRight, ArrowDownLeft, ShieldAlert, FileText, Download, CheckCircle, RotateCcw, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminTransactionsProps {
  token: string;
}

export function AdminTransactions({ token }: AdminTransactionsProps) {
  const [activeTab, setActiveTab] = useState('all');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, totalRecords: 0, totalPages: 1 });
  const [summary, setSummary] = useState({ totalVolume: 0, totalCommission: 0 });
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [refundReason, setRefundReason] = useState("Buyer Discontent / Agreement");
  const [isPartialRefund, setIsPartialRefund] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/advanced/transactions/advanced?tab=${activeTab}&search=${encodeURIComponent(search)}&page=${page}&limit=15`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
        setSummary(data.summary || { totalVolume: 0, totalCommission: 0 });
        setPagination(data.pagination || { page: 1, limit: 15, totalRecords: 0, totalPages: 1 });
        setTabCounts(data.tabCounts || {});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [activeTab, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchTransactions();
  };

  const executeRefund = async (txId: string) => {
    if (!window.confirm("Confirm processing refund? This action will adjust balances idempotently on server.")) return;
    try {
      const idempotencyKey = `refund_${txId}_${Date.now()}`;
      const res = await fetch(`/api/admin/advanced/transactions/${txId}/refund`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          is_partial: isPartialRefund,
          partial_amount: isPartialRefund ? Number(partialAmount) : null,
          reason: refundReason
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refund failed");
      toast.success(data.message || "Refund executed successfully");
      fetchTransactions();
      if (selectedTx && selectedTx.id === txId) {
        setSelectedTx(null);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + ["Tx ID,Buyer,Seller,Product,Amount,Status,Date"]
        .concat(transactions.map(t => `"${t.id}","${t.buyer_name}","${t.seller_name}","${t.product_title}",${t.amount},"${t.status}","${t.created_at}"`))
        .join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Transactions_Export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-[#141428]/80 backdrop-blur-xl border border-border rounded-xl p-6 shadow-2xl font-sans text-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white tracking-wide">Transactions & Ledger Command</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Real-time financial activity, payment provider processing, idempotency-guaranteed refunds</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleExport} className="gap-2 border-border text-gray-300 hover:text-white">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
          <Button size="sm" variant="outline" onClick={fetchTransactions} className="gap-2 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#101020] border border-emerald-500/20 p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase">Filtered Volume</div>
            <div className="text-lg font-bold text-emerald-400 font-mono">${summary.totalVolume?.toFixed(2)}</div>
          </div>
          <DollarSign className="w-6 h-6 text-emerald-400/50" />
        </div>
        <div className="bg-[#101020] border border-indigo-500/20 p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono text-muted-foreground uppercase">Platform Revenue (Fees)</div>
            <div className="text-lg font-bold text-indigo-400 font-mono">${summary.totalCommission?.toFixed(2)}</div>
          </div>
          <ArrowUpRight className="w-6 h-6 text-indigo-400/50" />
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none border-b border-white/10">
        {[
          { id: 'all', label: 'All Transactions' },
          { id: 'payments', label: 'Payments & Sales' },
          { id: 'refunds', label: 'Refunds' },
          { id: 'disputes', label: 'Disputes' },
          { id: 'chargebacks', label: 'Chargebacks' }
        ].map(subTab => (
          <button
            key={subTab.id}
            onClick={() => { setActiveTab(subTab.id); setPage(1); }}
            className={`px-4 py-2 rounded-lg font-mono text-xs uppercase tracking-wider flex items-center gap-2 whitespace-nowrap transition-all ${
              activeTab === subTab.id
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                : 'text-muted-foreground hover:bg-white/5 hover:text-white'
            }`}
          >
            {subTab.label}
            {tabCounts[subTab.id] !== undefined && (
              <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] text-gray-300">
                {tabCounts[subTab.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} className="mb-6 max-w-md">
        <div className="relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search Tx ID, Buyer Name, Seller Name, Product Title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#101020] border border-border/50 rounded-lg pl-10 pr-4 py-2 text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-indigo-500"
          />
        </div>
      </form>

      {/* Main Table + Drawer Split */}
      <div className="flex flex-col xl:flex-row gap-6">
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-black/40 text-[11px] font-mono text-indigo-300 uppercase tracking-wider">
                <th className="py-3 px-4">Transaction ID & Product</th>
                <th className="py-3 px-4">Buyer / Seller</th>
                <th className="py-3 px-4">Gross Amount</th>
                <th className="py-3 px-4">Fee / Earnings</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs text-gray-300">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-white">{t.product_title || 'Marketplace Item'}</div>
                    <div className="text-[10px] font-mono text-indigo-400">{t.id}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-white"><span className="text-muted-foreground">B:</span> {t.buyer_name || 'Anonymous'}</div>
                    <div className="text-gray-400 text-[11px]"><span className="text-muted-foreground">S:</span> {t.seller_name || 'Platform'}</div>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-emerald-400">${t.amount?.toFixed(2)}</td>
                  <td className="py-3 px-4 font-mono text-[11px]">
                    <div className="text-indigo-300">Fee: ${t.platform_fee?.toFixed(2)}</div>
                    <div className="text-gray-400">Net: ${t.seller_earnings?.toFixed(2)}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      t.status === 'completed' || t.status === 'successful' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      t.status === 'refunded' || t.status === 'partially_refunded' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      t.status === 'chargeback' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                      'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex gap-1.5 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setSelectedTx(t)} className="h-7 text-[10px] border-border text-gray-300 hover:text-white px-2">
                        <Eye className="w-3 h-3 mr-1" /> Inspect
                      </Button>
                      {t.status !== 'refunded' && (
                        <Button size="sm" onClick={() => { setSelectedTx(t); setIsPartialRefund(false); }} className="h-7 text-[10px] bg-amber-600/30 text-amber-300 hover:bg-amber-600/50 border border-amber-500/30 px-2">
                          Refund
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground font-mono">
                    No transaction records found matching tab filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/10 text-xs font-mono text-muted-foreground">
            <div>
              Showing {transactions.length} of {pagination.totalRecords} records (Page {pagination.page} of {pagination.totalPages})
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="h-7 text-xs border-border"
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage(p => p + 1)}
                className="h-7 text-xs border-border"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Transaction Large Modal Inspector */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#101024] border border-indigo-500/40 rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-6 shadow-[0_0_50px_rgba(79,70,229,0.2)] animate-in fade-in zoom-in-95 text-white">
            <div className="flex justify-between items-center pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-xl">Transaction & Settlement Details</h3>
                  <p className="text-xs text-muted-foreground font-mono">TX ID: {selectedTx.id} • Created: {new Date(selectedTx.created_at).toLocaleString()}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedTx(null)} 
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <span className="text-[10px] text-emerald-400 uppercase font-mono block">Gross Amount</span>
                <span className="text-2xl font-bold font-mono text-emerald-300">${selectedTx.amount?.toFixed(2)}</span>
              </div>
              <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                <span className="text-[10px] text-indigo-400 uppercase font-mono block">Platform Fee (25%)</span>
                <span className="text-2xl font-bold font-mono text-indigo-300">${selectedTx.platform_fee?.toFixed(2)}</span>
              </div>
              <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <span className="text-[10px] text-purple-400 uppercase font-mono block">Seller Net Payout</span>
                <span className="text-2xl font-bold font-mono text-purple-300">${((selectedTx.amount || 0) - (selectedTx.platform_fee || 0)).toFixed(2)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                <div className="text-xs font-bold text-indigo-400 uppercase font-mono">Parties Involved</div>
                <div className="space-y-2">
                  <div>
                    <span className="text-muted-foreground uppercase text-[10px] font-mono block">Buyer</span>
                    <span className="text-white font-semibold">{selectedTx.buyer_name || 'Buyer'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground uppercase text-[10px] font-mono block">Seller</span>
                    <span className="text-white font-semibold">{selectedTx.seller_name || 'Seller'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground uppercase text-[10px] font-mono block">Product</span>
                    <span className="text-indigo-300 font-semibold">{selectedTx.product_title || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                <div className="text-xs font-bold text-indigo-400 uppercase font-mono">Payment Status</div>
                <div className="space-y-2">
                  <div>
                    <span className="text-muted-foreground uppercase text-[10px] font-mono block">Gateway / Method</span>
                    <span className="text-white font-mono uppercase">{selectedTx.payment_method || 'Razorpay Gateway'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground uppercase text-[10px] font-mono block">Settlement Status</span>
                    <span className={`font-bold font-mono uppercase ${selectedTx.status === 'completed' ? 'text-emerald-400' : selectedTx.status === 'refunded' ? 'text-purple-400' : 'text-amber-400'}`}>
                      {selectedTx.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Refund Control */}
            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-3">
              <div className="text-xs font-bold text-amber-400 uppercase font-mono flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4" /> Idempotent Server-Side Refund Processing
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="partial"
                  checked={isPartialRefund}
                  onChange={(e) => setIsPartialRefund(e.target.checked)}
                  className="accent-amber-500 w-4 h-4"
                />
                <label htmlFor="partial" className="text-xs text-gray-300 font-medium">Enable Custom Partial Refund Mode</label>
              </div>

              {isPartialRefund && (
                <div>
                  <label className="text-[10px] uppercase font-mono text-muted-foreground block mb-1">Custom Partial Amount ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder={`Max $${selectedTx.amount?.toFixed(2)}`}
                    value={partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value)}
                    className="w-full bg-[#141428] border border-border rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] uppercase font-mono text-muted-foreground block mb-1">Select Refund Reason</label>
                <select
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full bg-[#141428] border border-border rounded-lg px-3 py-2 text-xs text-white"
                >
                  <option value="Buyer Discontent / Agreement">Buyer Discontent / Mutual Agreement</option>
                  <option value="Defective / Non-functional Code">Defective / Non-functional Code</option>
                  <option value="Duplicate Charge">Duplicate Charge</option>
                  <option value="Fraud / Unauthorized Usage">Fraud / Unauthorized Usage</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  size="sm"
                  onClick={() => executeRefund(selectedTx.id)}
                  disabled={selectedTx.status === 'refunded'}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-6 h-9"
                >
                  Execute Refund
                </Button>
                <Button size="sm" onClick={() => setSelectedTx(null)} variant="outline" className="border-border text-white text-xs">
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
