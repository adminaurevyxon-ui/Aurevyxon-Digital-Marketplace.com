import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Search, ShieldCheck, ShieldAlert, FileText, RefreshCw, CheckCircle, XCircle, AlertCircle, HelpCircle, Eye, Clock, Calendar, AlertTriangle } from "lucide-react";
import { Seller360DetailModal } from "@/components/admin/Seller360DetailModal";
import { RequestAdditionalKycModal } from "@/components/admin/RequestAdditionalKycModal";

export function AdminKYC() {
  const [activeTab, setActiveTab] = useState('pending');
  const [kycRecords, setKycRecords] = useState<any[]>([]);
  const [reverificationRequests, setReverificationRequests] = useState<any[]>([]);
  const { token } = useAuth();
  const [selectedKyc, setSelectedKyc] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("Blurry");
  const [adminNotes, setAdminNotes] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [pagination, setPagination] = useState({ page: 1, limit: 15, totalRecords: 0, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [kycSlaHours, setKycSlaHours] = useState("72");

  // Re-verification modal state
  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [targetSellerForReq, setTargetSellerForReq] = useState<{ id: string; name: string } | null>(null);

  // Extend deadline modal state
  const [extendModal, setExtendModal] = useState<{ open: boolean; reqId: string; hours: number } | null>(null);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/admin/settings", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.settings?.kyc_sla_hours) {
          setKycSlaHours(String(data.settings.kyc_sla_hours));
        }
      }
    } catch (e) {
      console.warn("Fetch settings error:", e);
    }
  };

  const saveSettings = async () => {
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ kyc_sla_hours: kycSlaHours })
      });
      if (res.ok) {
        toast.success("KYC SLA & Policy Settings saved successfully!");
      } else {
        toast.error("Failed to save settings");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save settings");
    }
  };

  const fetchReverifications = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/advanced/kyc/reverifications/all?search=${encodeURIComponent(search)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReverificationRequests(data.requests || []);
      }
    } catch (e: any) {
      console.warn("Fetch reverifications error:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchKYC = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/advanced/kyc/advanced?tab=${activeTab}&search=${encodeURIComponent(search)}&page=${page}&limit=15`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setKycRecords(data.records || []);
        setTabCounts(data.tabCounts || {});
        setPagination(data.pagination || { page: 1, limit: 15, totalRecords: 0, totalPages: 1 });
      }
    } catch (e: any) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'settings') {
      fetchSettings();
    } else if (activeTab === 'reverifications') {
      fetchReverifications();
    } else {
      fetchKYC();
    }
  }, [token, activeTab, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    if (activeTab === 'reverifications') {
      fetchReverifications();
    } else {
      fetchKYC();
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      const res = await fetch(`/api/admin/advanced/kyc/${id}/action`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: rejectReason, admin_notes: adminNotes })
      });
      if (!res.ok) throw new Error("Failed to execute KYC action");
      const data = await res.json();
      toast.success(data.message || `KYC status updated to ${action}`);
      fetchKYC();
      setSelectedKyc(null);
      setAdminNotes("");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleReverificationAction = async (reqId: string, action: string, extra: any = {}) => {
    try {
      const res = await fetch(`/api/admin/advanced/kyc/reverification/${reqId}/action`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Action failed");
      }
      const data = await res.json();
      toast.success(data.message || `Action ${action} completed successfully`);
      fetchReverifications();
      setExtendModal(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this seller KYC application?")) return;
    try {
      const res = await fetch(`/api/admin/kyc/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to delete application");
      toast.success("Application deleted");
      fetchKYC();
      setSelectedKyc(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="bg-[#141428]/80 backdrop-blur-xl border border-border rounded-xl p-6 font-sans text-sm shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white tracking-wide">KYC Verification & Identity Portal</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Review seller identity documents, tax registrations, and supplementary re-verification workflows</p>
        </div>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={activeTab === 'reverifications' ? fetchReverifications : fetchKYC} 
          className="gap-2 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* KYC Sub Tabs */}
      <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 mb-6 scrollbar-thin sm:scrollbar-none scroll-smooth touch-pan-x overscroll-x-contain -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-white/10">
        {[
          { id: 'pending', label: 'Pending Review' },
          { id: 'approved', label: 'Approved (Verified)' },
          { id: 'rejected', label: 'Rejected' },
          { id: 'requires_info', label: 'Requires Information' },
          { id: 'resubmission', label: 'Resubmission' },
          { id: 'reverifications', label: 'Re-Verification Requests' },
          { id: 'expired', label: 'Expired' },
          { id: 'settings', label: 'Verification Settings' }
        ].map(subTab => (
          <button
            key={subTab.id}
            onClick={() => { setActiveTab(subTab.id); setPage(1); }}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-mono text-[11px] sm:text-xs uppercase tracking-wider flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 transition-all ${
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

      {/* Verification Settings View */}
      {activeTab === 'settings' ? (
        <div className="bg-[#101020] border border-border/50 rounded-xl p-6 max-w-2xl space-y-4">
          <h3 className="text-base font-bold text-white mb-2">Platform KYC Policy Settings</h3>
          <div className="space-y-3 text-xs text-gray-300">
            <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5">
              <div>
                <div className="font-bold text-white">Require KYC for Seller Withdrawals</div>
                <div className="text-muted-foreground text-[11px]">Sellers must be KYC verified before releasing payout requests.</div>
              </div>
              <input type="checkbox" defaultChecked className="w-4 h-4 accent-indigo-500" />
            </div>
            <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-white/5">
              <div>
                <div className="font-bold text-white">Auto-Flag High Risk Identity Submissions</div>
                <div className="text-muted-foreground text-[11px]">Route submissions with risk score &gt; 50% to step-up admin review.</div>
              </div>
              <input type="checkbox" defaultChecked className="w-4 h-4 accent-indigo-500" />
            </div>
            <div className="p-3 bg-black/20 rounded-lg border border-white/5 space-y-2">
              <div className="font-bold text-white">KYC Review SLA Countdown Target (Hours)</div>
              <div className="text-muted-foreground text-[11px] mb-1">
                Configurable review window displayed on the seller's approval pending banner (e.g. 24, 48, 72, 96 hours).
              </div>
              <select 
                value={kycSlaHours} 
                onChange={(e) => setKycSlaHours(e.target.value)}
                className="w-full bg-[#141428] border border-border rounded px-3 py-2 text-xs text-white"
              >
                <option value="24">24 Hours (1 Day Express Review)</option>
                <option value="48">48 Hours (2 Days Fast Track)</option>
                <option value="72">72 Hours (3 Days Standard SLA)</option>
                <option value="96">96 Hours (4 Days Extended SLA)</option>
                <option value="120">120 Hours (5 Days Full Review)</option>
              </select>
            </div>
            <div className="p-3 bg-black/20 rounded-lg border border-white/5 space-y-2">
              <div className="font-bold text-white">Document Retention Policy</div>
              <select className="w-full bg-[#141428] border border-border rounded px-3 py-2 text-xs text-white">
                <option value="90">90 Days Post-Verification Encrypted Storage</option>
                <option value="180">180 Days Post-Verification Encrypted Storage</option>
                <option value="365">1 Year Retention (Tax Compliant)</option>
              </select>
            </div>
          </div>
          <Button size="sm" onClick={saveSettings} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs">
            Save Verification Settings
          </Button>
        </div>
      ) : activeTab === 'reverifications' ? (
        /* Re-Verification Requests Tab View */
        <div className="space-y-6">
          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="mb-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by Seller, Request ID, Email or Reason..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#101020] border border-border/50 rounded-lg pl-10 pr-4 py-2 text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-indigo-500"
              />
            </div>
          </form>

          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <table className="min-w-[680px] w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-black/40 text-[11px] font-mono text-indigo-300 uppercase tracking-wider">
                  <th className="py-3 px-4">Request ID & Seller</th>
                  <th className="py-3 px-4">Reason & Policy</th>
                  <th className="py-3 px-4">Server Deadline & Time Left</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Notified / Submitted</th>
                  <th className="py-3 px-4 text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs text-gray-300">
                {reverificationRequests.map((r) => {
                  const deadlineDate = r.deadline_at ? new Date(r.deadline_at) : null;
                  const days = Math.floor((r.seconds_remaining || 0) / (3600 * 24));
                  const hours = Math.floor(((r.seconds_remaining || 0) % (3600 * 24)) / 3600);
                  const mins = Math.floor(((r.seconds_remaining || 0) % 3600) / 60);

                  return (
                    <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{r.seller_name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{r.seller_email}</div>
                        <div className="text-[9px] font-mono text-indigo-400/80">REQ: {r.id}</div>
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-medium text-white truncate" title={r.reason}>{r.reason}</div>
                        <div className="text-[10px] font-mono text-amber-400/90 mt-0.5">
                          Policy: {r.expiration_action || 'RESTRICT_FEATURES'}
                        </div>
                        {r.admin_notes && (
                          <div className="text-[10px] text-zinc-400 truncate mt-0.5" title={r.admin_notes}>
                            Notes: {r.admin_notes}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <div className="text-white text-xs">
                          {deadlineDate ? deadlineDate.toLocaleString() : 'N/A'}
                        </div>
                        {['PENDING', 'SUBMITTED', 'UNDER_REVIEW'].includes(String(r.status).toUpperCase()) && (
                          <div className={`text-[11px] font-bold mt-0.5 ${r.is_expired ? 'text-rose-400' : 'text-amber-400'}`}>
                            {r.is_expired ? 'EXPIRED' : `${days > 0 ? `${days}d ` : ''}${hours}h ${mins}m left`}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                          r.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                          r.status === 'PENDING' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          r.status === 'EXPIRED' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                          r.status === 'CANCELLED' ? 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30' :
                          'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-zinc-400">
                        <div>Req: {r.requested_at ? new Date(r.requested_at).toLocaleDateString() : 'N/A'}</div>
                        {r.submitted_at && <div className="text-blue-300">Sub: {new Date(r.submitted_at).toLocaleDateString()}</div>}
                        {r.completed_at && <div className="text-emerald-300">Done: {new Date(r.completed_at).toLocaleDateString()}</div>}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-1.5 whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedKyc({ id: r.seller_id || r.user_id, user_id: r.seller_id || r.user_id })}
                            className="h-7 text-[10px] border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 whitespace-nowrap"
                          >
                            <Eye className="w-3 h-3 mr-1" /> Inspect
                          </Button>

                          {['PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'EXPIRED'].includes(String(r.status).toUpperCase()) && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setExtendModal({ open: true, reqId: r.id, hours: 48 })}
                                className="h-7 text-[10px] border-amber-500/30 text-amber-300 hover:bg-amber-500/20 whitespace-nowrap"
                              >
                                <Clock className="w-3 h-3 mr-1" /> Extend
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  if (window.confirm("Cancel this re-verification request?")) {
                                    handleReverificationAction(r.id, "cancel");
                                  }
                                }}
                                className="h-7 text-[10px] border-zinc-500/30 text-zinc-400 hover:bg-zinc-500/20 whitespace-nowrap"
                              >
                                Cancel
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {reverificationRequests.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground font-mono">
                      No supplementary or re-verification requests recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Regular KYC Tabs View */
        <>
          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search Applicant, Seller ID, Email or Tax ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#101020] border border-border/50 rounded-lg pl-10 pr-4 py-2 text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-indigo-500"
              />
            </div>
          </form>

          {/* Table */}
          <div className="flex flex-col xl:flex-row gap-6">
            <div className="flex-1 overflow-x-auto -mx-2 sm:mx-0">
              <table className="min-w-[680px] w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-black/40 text-[11px] font-mono text-indigo-300 uppercase tracking-wider">
                    <th className="py-3 px-4">Applicant & Seller ID</th>
                    <th className="py-3 px-4">Country</th>
                    <th className="py-3 px-4">Payout Method</th>
                    <th className="py-3 px-4">Risk Score</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs text-gray-300">
                  {kycRecords.map((k) => (
                    <tr key={k.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{k.display_name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{k.user_email || k.user_email_account}</div>
                        <div className="text-[9px] font-mono text-indigo-400/80">ID: {k.user_id}</div>
                      </td>
                      <td className="py-3 px-4 font-mono uppercase text-gray-300">{k.country || k.user_country || 'US'}</td>
                      <td className="py-3 px-4 uppercase text-xs font-mono">{k.payout_method || 'Bank Transfer'}</td>
                      <td className="py-3 px-4">
                        <span className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                          (k.risk_score || 15) > 50 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {k.risk_score || 15}%
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                          k.kyc_status === 'verified' || k.kyc_status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          k.kyc_status === 'pending' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          k.kyc_status === 'requires_info' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                          'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {k.kyc_status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-1.5 whitespace-nowrap">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => { setSelectedKyc(k); setAdminNotes(k.admin_notes || ""); }} 
                            className="h-7 text-[10px] border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 whitespace-nowrap"
                          >
                            Inspect & Review
                          </Button>
                          <Button
                            size="sm" 
                            variant="outline" 
                            onClick={() => {
                              setTargetSellerForReq({ id: k.user_id || k.id, name: k.display_name });
                              setReqModalOpen(true);
                            }}
                            className="h-7 text-[10px] border-amber-500/30 text-amber-300 hover:bg-amber-500/20 whitespace-nowrap"
                            title="Request Supplementary KYC Re-Verification"
                          >
                            <Clock className="w-3 h-3 mr-1" /> Re-Verify
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {kycRecords.length === 0 && !loading && (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-muted-foreground font-mono">
                        No seller KYC records found for tab "{activeTab}".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/10 text-xs font-mono text-muted-foreground">
                <div>
                  Showing {kycRecords.length} of {pagination.totalRecords} records (Page {pagination.page} of {pagination.totalPages})
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
        </>
      )}

      {/* Render 360° Seller Detail Modal */}
      {selectedKyc && (
        <Seller360DetailModal
          sellerId={selectedKyc.id || selectedKyc.user_id}
          onClose={() => setSelectedKyc(null)}
          onRefreshList={() => {
            if (activeTab === 'reverifications') fetchReverifications();
            else fetchKYC();
          }}
        />
      )}

      {/* Request Additional KYC Modal */}
      {targetSellerForReq && (
        <RequestAdditionalKycModal
          isOpen={reqModalOpen}
          onClose={() => {
            setReqModalOpen(false);
            setTargetSellerForReq(null);
          }}
          sellerId={targetSellerForReq.id}
          sellerName={targetSellerForReq.name}
          token={token}
          onSuccess={() => {
            fetchKYC();
            fetchReverifications();
          }}
        />
      )}

      {/* Extend Deadline Modal */}
      {extendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#101020] border border-amber-500/40 rounded-xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" /> Extend Verification Deadline
            </h3>
            <p className="text-xs text-zinc-300">
              Select additional hours to extend the seller's verification window:
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[24, 48, 72].map(h => (
                <button
                  key={h}
                  onClick={() => setExtendModal({ ...extendModal, hours: h })}
                  className={`py-2 rounded border text-xs font-bold font-mono transition-all ${
                    extendModal.hours === h
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                      : 'bg-black/40 border-white/10 text-zinc-300 hover:border-white/30'
                  }`}
                >
                  +{h} Hours
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => setExtendModal(null)} className="h-8 text-xs border-border">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => handleReverificationAction(extendModal.reqId, "extend", { extend_hours: extendModal.hours })}
                className="h-8 text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold"
              >
                Confirm Extension
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
