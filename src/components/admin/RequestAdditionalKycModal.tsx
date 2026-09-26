import React, { useState, useEffect } from "react";
import { 
  ShieldAlert, Clock, AlertTriangle, CheckCircle2, XCircle, 
  History, Calendar, Send, RefreshCw, X, AlertCircle, ShieldCheck 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface RequestAdditionalKycModalProps {
  isOpen: boolean;
  onClose: () => void;
  sellerId: string;
  sellerName?: string;
  token?: string;
  onSuccess?: () => void;
}

export function RequestAdditionalKycModal({
  isOpen,
  onClose,
  sellerId,
  sellerName,
  token,
  onSuccess
}: RequestAdditionalKycModalProps) {
  const [activeTab, setActiveTab] = useState<"request" | "history">("request");
  const [loading, setLoading] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [activeRequest, setActiveRequest] = useState<any | null>(null);

  // Form states
  const [reasonPreset, setReasonPreset] = useState("Periodic Compliance Review");
  const [reason, setReason] = useState("Periodic compliance verification required for active seller privileges.");
  const [deadlinePreset, setDeadlinePreset] = useState("72h");
  const [customDeadlineDate, setCustomDeadlineDate] = useState("");
  const [deadlineHours, setDeadlineHours] = useState(72);
  const [expirationAction, setExpirationAction] = useState("RESTRICT_FEATURES");
  const [gracePeriodHours, setGracePeriodHours] = useState(24);
  const [adminNotes, setAdminNotes] = useState("");
  const [forceOverride, setForceOverride] = useState(false);

  const fetchHistoryAndStatus = async () => {
    if (!sellerId || !token) return;
    setFetchingHistory(true);
    try {
      const res = await fetch(`/api/admin/advanced/kyc/${sellerId}/reverification-history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const hist = data.history || [];
        setHistory(hist);
        const active = hist.find((r: any) => 
          Number(r.is_active) === 1 && ['PENDING', 'SUBMITTED', 'UNDER_REVIEW'].includes(String(r.status).toUpperCase())
        );
        setActiveRequest(active || null);
      }
    } catch (e) {
      console.warn("Failed to fetch reverification history:", e);
    } finally {
      setFetchingHistory(false);
    }
  };

  useEffect(() => {
    if (isOpen && sellerId) {
      fetchHistoryAndStatus();
    }
  }, [isOpen, sellerId]);

  const handleReasonPresetChange = (val: string) => {
    setReasonPreset(val);
    if (val === "Periodic Compliance Review") {
      setReason("Periodic compliance review required to maintain verified seller status.");
    } else if (val === "Document Re-Verification / Expired ID") {
      setReason("Your previously submitted identification document is expiring or requires updated high-resolution verification.");
    } else if (val === "Payout / Tax ID Discrepancy") {
      setReason("Information discrepancy identified between submitted tax registration and withdrawal account.");
    } else if (val === "Suspicious Activity / Security Audit") {
      setReason("Account triggered a periodic risk compliance check. Please re-verify identity credentials.");
    } else if (val === "Seller Profile Info Change") {
      setReason("Recent changes to business name, address, or ownership require updated verification documentation.");
    } else {
      setReason("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      return toast.error("Please provide a clear reason for requesting KYC re-verification.");
    }
    if (!token) return toast.error("Admin authentication token missing.");

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/advanced/kyc/${sellerId}/request-reverification`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          reason: reason.trim(),
          deadline_preset: deadlinePreset,
          deadline_hours: deadlinePreset === "custom" ? deadlineHours : undefined,
          custom_deadline_date: deadlinePreset === "custom" ? customDeadlineDate : undefined,
          expiration_action: expirationAction,
          grace_period_hours: gracePeriodHours,
          admin_notes: adminNotes.trim(),
          force_override: forceOverride
        })
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.duplicate) {
          toast.error("An active re-verification request is already pending for this seller.");
          setActiveRequest(data.activeRequest);
          return;
        }
        throw new Error(data.error || "Failed to trigger re-verification request");
      }

      toast.success("Additional KYC verification requested. Seller has been notified with server-side deadline.");
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit request");
    } finally {
      setLoading(false);
    }
  };

  const handleActiveRequestAction = async (action: "approve" | "reject" | "cancel" | "extend", extendHours = 48) => {
    if (!activeRequest || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/advanced/kyc/reverification/${activeRequest.id}/action`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          extend_hours: extendHours,
          admin_notes: `Action '${action}' performed from Re-verification Manager`
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${action} request`);
      
      toast.success(data.message || `Request ${action}ed`);
      await fetchHistoryAndStatus();
      if (onSuccess) onSuccess();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#0E0E20] border border-indigo-500/30 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl text-white font-sans overflow-hidden">
        
        {/* Header */}
        <div className="p-5 bg-[#14142E] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Request Additional KYC Verification
              </h2>
              <p className="text-xs text-muted-foreground font-mono">
                Seller: <span className="text-indigo-300 font-bold">{sellerName || sellerId}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 px-5 bg-[#101026]">
          <button
            onClick={() => setActiveTab("request")}
            className={`py-3 px-4 text-xs font-mono font-bold uppercase border-b-2 transition-all ${
              activeTab === "request"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-muted-foreground hover:text-white"
            }`}
          >
            New Request
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`py-3 px-4 text-xs font-mono font-bold uppercase border-b-2 transition-all flex items-center gap-2 ${
              activeTab === "history"
                ? "border-indigo-400 text-indigo-400"
                : "border-transparent text-muted-foreground hover:text-white"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Audit History ({history.length})
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === "request" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Active Request Alert / Duplicate Protection */}
              {activeRequest && (
                <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-amber-300 font-bold">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" /> Active Re-Verification in Progress
                    </span>
                    <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                      {activeRequest.status}
                    </span>
                  </div>
                  <p className="text-gray-300">
                    This seller already has an active deadline: <b className="text-white font-mono">{new Date(activeRequest.deadline_at).toLocaleString()}</b>.
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    Reason: "{activeRequest.reason}"
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-amber-500/20">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleActiveRequestAction("extend", 48)}
                      disabled={loading}
                      variant="outline"
                      className="h-7 text-[11px] border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
                    >
                      <Clock className="w-3 h-3 mr-1" /> Extend Deadline (+48h)
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleActiveRequestAction("cancel")}
                      disabled={loading}
                      variant="outline"
                      className="h-7 text-[11px] border-red-500/40 text-red-300 hover:bg-red-500/20"
                    >
                      <XCircle className="w-3 h-3 mr-1" /> Cancel Active Request
                    </Button>
                    <label className="flex items-center gap-1.5 ml-auto text-[11px] text-gray-300 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={forceOverride} 
                        onChange={(e) => setForceOverride(e.target.checked)} 
                        className="rounded border-gray-600 accent-amber-500"
                      />
                      <span>Force override with new parameters</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Reason Preset & Free Text */}
              <div className="space-y-2">
                <label className="text-xs font-mono uppercase text-muted-foreground block">
                  Verification Trigger Reason <span className="text-red-400">*</span>
                </label>
                <select
                  value={reasonPreset}
                  onChange={(e) => handleReasonPresetChange(e.target.value)}
                  className="w-full bg-[#14142C] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500"
                >
                  <option value="Periodic Compliance Review">Periodic Compliance Review (Regular Audit)</option>
                  <option value="Document Re-Verification / Expired ID">Document Re-Verification / Expired ID</option>
                  <option value="Payout / Tax ID Discrepancy">Payout / Tax ID Discrepancy</option>
                  <option value="Suspicious Activity / Security Audit">Suspicious Activity / Security Audit</option>
                  <option value="Seller Profile Info Change">Seller Profile Info Change</option>
                  <option value="Custom Reason">Custom Specific Reason</option>
                </select>

                <textarea
                  rows={3}
                  required
                  placeholder="Explain why re-verification is requested. This text will be shown to the seller in notifications and banner."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-[#14142C] border border-white/10 rounded-lg p-3 text-xs text-white focus:border-indigo-500"
                />
              </div>

              {/* Deadline Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase text-muted-foreground block">
                    Submission Deadline Window
                  </label>
                  <select
                    value={deadlinePreset}
                    onChange={(e) => setDeadlinePreset(e.target.value)}
                    className="w-full bg-[#14142C] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500"
                  >
                    <option value="24h">24 Hours (1 Day Urgent)</option>
                    <option value="48h">48 Hours (2 Days)</option>
                    <option value="72h">72 Hours (3 Days Standard)</option>
                    <option value="7d">7 Days (1 Week Standard)</option>
                    <option value="15d">15 Days (2 Weeks)</option>
                    <option value="30d">30 Days (1 Month Extended)</option>
                    <option value="custom">Custom Date / Hours</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase text-muted-foreground block">
                    Action on Deadline Expiry
                  </label>
                  <select
                    value={expirationAction}
                    onChange={(e) => setExpirationAction(e.target.value)}
                    className="w-full bg-[#14142C] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:border-indigo-500"
                  >
                    <option value="RESTRICT_FEATURES">Restrict Features (Block Uploads & Payouts)</option>
                    <option value="SUSPEND_ACCOUNT">Suspend Account Privileges</option>
                    <option value="BLOCK_ACCOUNT">Block Account Access</option>
                    <option value="DEACTIVATE_ACCOUNT">Deactivate Account</option>
                    <option value="WARNING_ONLY">Warning Banner Only</option>
                  </select>
                </div>
              </div>

              {deadlinePreset === "custom" && (
                <div className="p-3 bg-[#14142C] border border-white/10 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">Specific Target Date & Time</label>
                    <input
                      type="datetime-local"
                      value={customDeadlineDate}
                      onChange={(e) => setCustomDeadlineDate(e.target.value)}
                      className="w-full bg-[#0E0E20] border border-white/10 rounded px-2.5 py-1.5 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">Or Specific Hours Count</label>
                    <input
                      type="number"
                      min={1}
                      value={deadlineHours}
                      onChange={(e) => setDeadlineHours(Number(e.target.value))}
                      className="w-full bg-[#0E0E20] border border-white/10 rounded px-2.5 py-1.5 text-white text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Grace Period & Admin Internal Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase text-muted-foreground block">
                    Optional Grace Period (Before suspension)
                  </label>
                  <select
                    value={gracePeriodHours}
                    onChange={(e) => setGracePeriodHours(Number(e.target.value))}
                    className="w-full bg-[#14142C] border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value={0}>No Grace Period (Immediate Expiration Action)</option>
                    <option value={24}>24 Hours Warning Grace Period</option>
                    <option value={48}>48 Hours Warning Grace Period</option>
                    <option value={72}>72 Hours Warning Grace Period</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono uppercase text-muted-foreground block">
                    Admin Internal Notes (Private)
                  </label>
                  <input
                    type="text"
                    placeholder="Case reference, audit ticket ID, etc."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    className="w-full bg-[#14142C] border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="border-white/10 text-gray-300 hover:bg-white/5 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading || (!!activeRequest && !forceOverride)}
                  className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-5 shadow-lg shadow-amber-900/30 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {loading ? "Processing..." : "Issue Re-Verification Notice"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {fetchingHistory ? (
                <div className="py-12 text-center text-gray-400 text-xs font-mono">
                  Loading re-verification history records...
                </div>
              ) : history.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-xs font-mono">
                  No previous re-verification requests recorded for this seller.
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-[#14142C] border border-white/10 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                          item.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          item.status === 'REJECTED' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                          item.status === 'EXPIRED' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                          item.status === 'CANCELLED' ? 'bg-gray-500/20 text-gray-400' :
                          'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}>
                          {item.status}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {new Date(item.created_at || item.requested_at).toLocaleString()}
                        </span>
                      </div>

                      <div>
                        <div className="text-white font-medium">"{item.reason}"</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Deadline: <span className="font-mono text-gray-300">{new Date(item.deadline_at).toLocaleString()}</span> | Policy: <span className="font-mono text-amber-300">{item.expiration_action}</span>
                        </div>
                      </div>

                      {item.admin_notes && (
                        <div className="text-[11px] font-mono text-indigo-300/80 bg-black/30 p-2 rounded border border-white/5">
                          Notes: {item.admin_notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
