import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { persistSellerProfileToFirestore } from "@/lib/firestoreService";
import { RequestAdditionalKycModal } from "@/components/admin/RequestAdditionalKycModal";
import { 
  X, Download, Eye, EyeOff, ShieldCheck, ShieldAlert, FileText, 
  User, Building, CreditCard, FileCheck, RefreshCw, CheckCircle2, 
  XCircle, AlertCircle, FileSpreadsheet, FileJson, Printer, FolderArchive, AlertTriangle,
  MessageSquare, Send, Clock
} from "lucide-react";

interface Seller360DetailModalProps {
  sellerId: string | null;
  onClose: () => void;
  onRefreshList?: () => void;
}

export function Seller360DetailModal({ sellerId, onClose, onRefreshList }: Seller360DetailModalProps) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [seller, setSeller] = useState<any>(null);
  const [showUnmasked, setShowUnmasked] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("Blurry Document Image");
  const [adminNotes, setAdminNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [reverificationModalOpen, setReverificationModalOpen] = useState(false);

  // Direct Messaging state
  const [threadMessages, setThreadMessages] = useState<any[]>([]);
  const [msgCategory, setMsgCategory] = useState("General");
  const [msgSubject, setMsgSubject] = useState("");
  const [msgText, setMsgText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !previewDoc && !reverificationModalOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, previewDoc, reverificationModalOpen]);

  // Lock background body and document scroll while modal is active on mobile/desktop
  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyTouchAction = document.body.style.touchAction;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.touchAction = originalBodyTouchAction;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  const fetchThread = async (targetUserId?: string) => {
    const uid = targetUserId || seller?.user_id;
    if (!uid) return;
    try {
      const res = await fetch(`/api/messages/thread/${uid}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setThreadMessages(data.messages || []);
      }
    } catch (e) {
      console.warn("Error loading message thread:", e);
    }
  };

  const fetchDetails = async () => {
    if (!sellerId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/advanced/kyc/${sellerId}/details`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to load seller 360° profile");
      const data = await res.json();
      setSeller(data.seller);
      setAdminNotes(data.seller?.admin_notes || "");
      if (data.seller?.user_id) {
        fetchThread(data.seller.user_id);
      }
    } catch (e: any) {
      toast.error(e.message || "Error fetching seller details");
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSendMessage = async () => {
    if (!seller?.user_id) return;
    if (!msgText.trim()) return toast.error("Please enter a message before sending.");
    setSendingMsg(true);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          seller_id: seller.user_id,
          category: msgCategory,
          subject: msgSubject,
          message: msgText
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send message");
      toast.success("Message dispatched to seller & real notification created.");
      setMsgText("");
      setMsgSubject("");
      fetchThread(seller.user_id);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSendingMsg(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [sellerId, token]);

  const toggleUnmasked = async () => {
    const nextState = !showUnmasked;
    setShowUnmasked(nextState);
    if (nextState) {
      toast.info("Unmasked sensitive details revealed. Access event logged.");
      try {
        await fetch(`/api/admin/advanced/kyc/${sellerId}/log-reveal`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (e) {}
    }
  };

  const maskValue = (val: string, fallback = "N/A") => {
    if (!val) return fallback;
    if (showUnmasked) return val;
    if (val.length <= 4) return "••••";
    return "•••• " + val.slice(-4);
  };

  const handleDownloadDetails = (format: "csv" | "json") => {
    if (!sellerId) return;
    const url = `/api/admin/advanced/kyc/${sellerId}/download-details?format=${format}&include_unmasked=${showUnmasked}`;
    
    fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Download failed");
        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `Seller_Details_${seller?.display_name || sellerId}_${format.toUpperCase()}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success(`Downloaded seller details in ${format.toUpperCase()} format (Audit logged)`);
      })
      .catch((err) => toast.error(err.message || "Failed to download details"));
  };

  const handleDownloadSingleDoc = (docId: string, fileName: string) => {
    fetch(`/api/admin/advanced/kyc/document/${docId}/download`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Document download failed");
        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success(`Downloaded document ${fileName} (Audit logged)`);
      })
      .catch((err) => toast.error(err.message || "Failed to download document"));
  };

  const handleBulkDownloadDocs = () => {
    if (!sellerId) return;
    toast.info("Preparing ZIP archive of all verification documents...");
    fetch(`/api/admin/advanced/kyc/${sellerId}/bulk-download-documents`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "ZIP download failed");
        }
        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `KYC_Docs_${seller?.display_name || sellerId}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success("Downloaded all verification documents ZIP archive (Audit logged)");
      })
      .catch((err) => toast.error(err.message || "Failed to bulk download documents"));
  };

  const handlePrintableReport = () => {
    window.print();
  };

  const handleAction = async (action: string) => {
    if (!sellerId) return;
    if (action === "reject" && !adminNotes && !rejectReason) {
      return toast.error("Rejection reason is mandatory when rejecting a seller.");
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/advanced/kyc/${sellerId}/action`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action, reason: rejectReason, admin_notes: adminNotes })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update KYC status");
      }
      const data = await res.json();
      
      // Sync seller KYC status directly to Cloud Firestore collection 'sellers'
      if (seller?.user_id) {
        await persistSellerProfileToFirestore({
          id: seller.user_id,
          user_id: seller.user_id,
          store_name: seller.display_name || "Seller Store",
          kyc_status: action === 'approve' ? 'verified' : action === 'reject' ? 'rejected' : action,
          admin_notes: adminNotes,
          rejection_reason: rejectReason
        }).catch(err => console.warn("Firestore seller sync warning:", err));
      }

      toast.success(data.message || `KYC status updated`);
      fetchDetails();
      if (onRefreshList) onRefreshList();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (!sellerId || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex flex-col w-full h-full h-[100dvh] max-h-[100dvh] overflow-hidden">
      <div className="bg-[#0D0D1E] w-full h-full max-h-[100dvh] flex flex-col shadow-2xl text-white font-sans overflow-hidden min-h-0 min-w-0 flex-1">
        
        {/* Header Bar */}
        <div className="p-3 sm:p-5 lg:px-8 bg-[#14142B] border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 flex-shrink-0">
          <div className="flex items-start sm:items-center gap-3 sm:gap-3.5 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-lg sm:text-xl text-white shadow-lg flex-shrink-0">
              {seller?.display_name?.charAt(0)?.toUpperCase() || "S"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h2 className="text-base sm:text-xl lg:text-2xl font-extrabold tracking-tight text-white break-words max-w-full sm:max-w-xl">
                  {seller?.display_name || seller?.full_legal_name || "Seller Application"}
                </h2>
                <span className={`px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-mono font-bold uppercase tracking-wider ${
                  seller?.kyc_status === 'verified' || seller?.kyc_status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                  seller?.kyc_status === 'pending' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' :
                  seller?.kyc_status === 'requires_info' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' :
                  'bg-red-500/20 text-red-400 border border-red-500/40'
                }`}>
                  {seller?.kyc_status || 'PENDING'}
                </span>
                <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded text-[10px] sm:text-xs font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase">
                  {seller?.seller_type || 'individual'}
                </span>
              </div>
              <p className="text-[11px] sm:text-sm text-muted-foreground font-mono mt-1 flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-0.5">
                <span>Seller ID: <strong className="text-indigo-300 break-all">{seller?.user_id || sellerId}</strong></span>
                <span className="hidden sm:inline text-white/20">•</span>
                <span>Account Email: <strong className="text-gray-300 break-all">{seller?.user_account_email || 'N/A'}</strong></span>
                {seller?.country && (
                  <>
                    <span className="hidden sm:inline text-white/20">•</span>
                    <span>Country: <strong className="text-cyan-300 uppercase">{seller.country}</strong></span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-end sm:justify-start flex-shrink-0 pt-1 sm:pt-0 border-t border-white/5 sm:border-t-0">
            <Button size="sm" variant="outline" onClick={fetchDetails} className="h-8 sm:h-9 px-2.5 sm:px-3.5 text-xs border-white/10 hover:bg-white/5 text-gray-200">
              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <button 
              onClick={onClose} 
              aria-label="Close Inspect & Review" 
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 flex items-center gap-1 sm:gap-1.5 text-gray-300 hover:text-white transition-colors border border-white/15 text-xs font-semibold h-8 sm:h-9"
            >
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Close View</span>
            </button>
          </div>
        </div>

        {/* Global Download & Security Bar */}
        <div className="px-3 sm:px-6 lg:px-8 py-2.5 bg-[#101024] border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs flex-shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin sm:scrollbar-none scroll-smooth touch-pan-x overscroll-x-contain -mx-1 px-1 sm:mx-0 sm:px-0">
            <span className="text-muted-foreground font-mono text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold mr-0.5 whitespace-nowrap shrink-0">Export Dossier:</span>
            <Button size="sm" variant="outline" onClick={() => handleDownloadDetails("csv")} className="h-7 text-[10px] sm:text-[11px] px-2 sm:px-2.5 bg-emerald-950/40 border-emerald-500/30 text-emerald-300 hover:bg-emerald-900/60 whitespace-nowrap shrink-0">
              <FileSpreadsheet className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 text-emerald-400" /> Export CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleDownloadDetails("json")} className="h-7 text-[10px] sm:text-[11px] px-2 sm:px-2.5 bg-blue-950/40 border-blue-500/30 text-blue-300 hover:bg-blue-900/60 whitespace-nowrap shrink-0">
              <FileJson className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 text-blue-400" /> Export JSON
            </Button>
            <Button size="sm" variant="outline" onClick={handlePrintableReport} className="h-7 text-[10px] sm:text-[11px] px-2 sm:px-2.5 bg-purple-950/40 border-purple-500/30 text-purple-300 hover:bg-purple-900/60 print:hidden whitespace-nowrap shrink-0">
              <Printer className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 text-purple-400" /> Printable Report
            </Button>
            <Button size="sm" variant="outline" onClick={handleBulkDownloadDocs} className="h-7 text-[10px] sm:text-[11px] px-2 sm:px-2.5 bg-indigo-950/40 border-indigo-500/30 text-indigo-300 hover:bg-indigo-900/60 whitespace-nowrap shrink-0">
              <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 text-indigo-400" /> Download All (ZIP)
            </Button>
          </div>

          <div className="flex items-center justify-end">
            <button 
              onClick={toggleUnmasked}
              className={`w-full sm:w-auto justify-center px-3 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all border ${
                showUnmasked 
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.2)]' 
                  : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
              }`}
            >
              {showUnmasked ? <EyeOff className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5 text-gray-400" />}
              <span>{showUnmasked ? "Sensitive Data Unmasked (Logged)" : "Reveal Unmasked Details"}</span>
            </button>
          </div>
        </div>

        {/* Content Body - Full Screen Spacious Grid with visible scroll and mobile clearance */}
        <div className="p-3 sm:p-6 lg:p-8 pb-48 sm:pb-36 overflow-y-auto overflow-x-hidden sm:overflow-x-auto flex-1 min-h-0 min-w-0 bg-[#0A0A18] w-full custom-visible-scrollbar overscroll-y-contain touch-pan-y">
          <div className="w-full max-w-full space-y-6 pb-20">
          {loading ? (
            <div className="py-24 text-center text-muted-foreground font-mono flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-9 h-9 animate-spin text-indigo-400" />
              <p className="text-sm">Fetching complete 360° seller verification dossier...</p>
            </div>
          ) : seller ? (
            <>
              {/* Risk & SLA Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-[#12122A] border border-white/5 flex items-center gap-3.5">
                  <div className={`w-11 h-11 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                    (seller?.risk_score || 15) > 50 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}>
                    {seller?.risk_score || 15}%
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Identity Risk Engine</div>
                    <div className="text-xs font-bold text-white mt-0.5">
                      {(seller?.risk_score || 15) > 50 ? 'High Risk Signal Flagged' : 'Low Fraud Risk — Clear to Process'}
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#12122A] border border-white/5 flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Submission Date & SLA</div>
                    <div className="text-xs font-bold text-white font-mono mt-0.5">
                      {seller?.kyc_submitted_at ? new Date(seller.kyc_submitted_at).toLocaleString() : 'N/A'}
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#12122A] border border-white/5 flex items-center gap-3.5 sm:col-span-2 lg:col-span-1">
                  <div className="w-11 h-11 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Legal Declaration Status</div>
                    <div className="text-xs font-bold text-emerald-400 mt-0.5">
                      Accepted ({seller?.declaration_version || 'v1.0'}) on {seller?.declaration_accepted_at ? new Date(seller.declaration_accepted_at).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 360° Data Grid: Personal Identity & Tax Details */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                
                {/* 1. Personal Identity */}
                <div className="p-5 sm:p-6 rounded-xl bg-[#111126] border border-white/10 space-y-4">
                  <h3 className="text-xs font-bold text-indigo-300 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
                    <User className="w-4 h-4 text-indigo-400" /> 1. Personal Legal Identity
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Full Legal Name</span>
                      <span className="text-white font-bold">{seller?.full_legal_name || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Date of Birth</span>
                      <span className="text-white font-mono">{seller?.dob || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">ID Document Type</span>
                      <span className="text-white font-mono">{seller?.id_type || 'Passport'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">National ID / PAN Number</span>
                      <span className="text-amber-400 font-mono font-bold">{maskValue(seller?.national_id || seller?.pan_number)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Phone Number</span>
                      <span className="text-white font-mono">{seller?.phone || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Country / Residence</span>
                      <span className="text-white font-mono uppercase">{seller?.country || 'India'}</span>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-white/5 text-xs">
                    <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Full Residential Address</span>
                    <span className="text-gray-200 leading-relaxed">
                      {[seller?.address_line1 || seller?.address, seller?.address_line2, seller?.city, seller?.state, seller?.postal_code, seller?.country].filter(Boolean).join(", ") || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* 2. Account & Tax Details */}
                <div className="p-5 sm:p-6 rounded-xl bg-[#111126] border border-white/10 space-y-4">
                  <h3 className="text-xs font-bold text-indigo-300 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
                    <FileText className="w-4 h-4 text-indigo-400" /> 2. Tax & Account Classification
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Account Classification</span>
                      <span className="text-purple-300 font-mono capitalize font-bold">{seller?.seller_type || 'individual'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Tax Residence Country</span>
                      <span className="text-white font-mono uppercase">{seller?.tax_country || seller?.country || 'India'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Tax ID / PAN Number</span>
                      <span className="text-amber-400 font-mono font-bold">{maskValue(seller?.tax_id || seller?.pan_number)}</span>
                    </div>
                    <div className="sm:col-span-2 md:col-span-1">
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">GSTIN / VAT Number</span>
                      <span className="text-white font-mono">{seller?.gstin || 'Not Applicable'}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Tax Terms Agreement</span>
                      <span className="text-emerald-400 font-mono font-semibold">
                        {seller?.tax_accepted ? '✓ Accepted & Formally Signed' : 'Pending Acceptance'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Business Details (If Business) */}
                <div className="p-5 sm:p-6 rounded-xl bg-[#111126] border border-white/10 space-y-4 xl:col-span-2">
                  <h3 className="text-xs font-bold text-indigo-300 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
                    <Building className="w-4 h-4 text-indigo-400" /> 3. Business Entity Information {seller?.seller_type !== 'business' && '(Individual Account — N/A)'}
                  </h3>
                  {seller?.seller_type === 'business' || seller?.business_legal_name ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Business Legal Name</span>
                        <span className="text-white font-bold">{seller?.business_legal_name || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Registration / CIN Number</span>
                        <span className="text-white font-mono">{seller?.business_reg_number || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Authorized Signatory</span>
                        <span className="text-white font-mono">{seller?.authorized_signatory_name || 'N/A'} {seller?.authorized_signatory_id ? `(${seller.authorized_signatory_id})` : ''}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Business Tax ID</span>
                        <span className="text-white font-mono">{seller?.business_tax_doc_name || 'N/A'}</span>
                      </div>
                      <div className="sm:col-span-2 lg:col-span-4 pt-2 border-t border-white/5">
                        <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Business Registered Address</span>
                        <span className="text-gray-200">
                          {[seller?.business_address_line1, seller?.business_address_line2, seller?.business_city, seller?.business_state, seller?.business_postal_code, seller?.business_country].filter(Boolean).join(", ") || 'Same as personal address'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Seller is registered under an Individual Account classification.</p>
                  )}
                </div>

                {/* 4. Bank & Settlement Payout Details */}
                <div className="p-5 sm:p-6 rounded-xl bg-[#111126] border border-white/10 space-y-4 xl:col-span-2">
                  <h3 className="text-xs font-bold text-indigo-300 font-mono uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-3">
                    <CreditCard className="w-4 h-4 text-indigo-400" /> 4. Bank Account & Payout Settlement Details
                  </h3>
                  
                  {seller?.payout_mismatch_flagged && (
                    <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-lg flex items-center gap-2 text-amber-300 text-xs">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <div>
                        <span className="font-bold">Ownership Mismatch Warning:</span> {seller?.payout_mismatch_reason || 'Account holder name does not match legal applicant name.'}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Payout Method</span>
                      <span className="text-white font-mono uppercase font-bold">{seller?.payout_method || 'Bank Transfer'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Bank Name</span>
                      <span className="text-white font-bold">{seller?.bank_name || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Account Holder Name</span>
                      <span className="text-white font-mono">{seller?.account_holder || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Bank Account Number</span>
                      <span className="text-emerald-400 font-mono font-bold">{maskValue(seller?.account_number)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">IFSC / SWIFT Code</span>
                      <span className="text-white font-mono">{seller?.ifsc_code || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">UPI ID</span>
                      <span className="text-white font-mono">{seller?.upi_id || 'N/A'}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground text-[10px] font-mono uppercase block mb-0.5">Payout Verification Status</span>
                      <span className={`font-mono text-xs font-bold ${seller?.payout_verified ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {seller?.payout_verified ? '✓ Payout Account Verified & Cleared' : 'Pending Administrative Settlement Verification'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5. Verification Documents Grid */}
                <div className="p-5 sm:p-6 rounded-xl bg-[#111126] border border-white/10 space-y-4 xl:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <h3 className="text-xs font-bold text-indigo-300 font-mono uppercase tracking-wider flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-indigo-400" /> 5. Submitted Verification Documents ({seller?.documents?.length || 0})
                    </h3>
                    <Button size="sm" variant="outline" onClick={handleBulkDownloadDocs} className="h-7 text-xs border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20">
                      <Download className="w-3.5 h-3.5 mr-1.5" /> Download All (ZIP)
                    </Button>
                  </div>

                  {seller?.documents?.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {seller.documents.map((doc: any) => (
                        <div key={doc.id} className="p-4 bg-[#15152F] border border-white/10 rounded-xl space-y-3 hover:border-indigo-500/40 transition-all flex flex-col justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-mono uppercase font-bold">
                                {doc.doc_slot} Side
                              </span>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {(doc.file_size / 1024).toFixed(0)} KB
                              </span>
                            </div>

                            <div>
                              <div className="text-xs font-bold text-white truncate" title={doc.file_name}>{doc.file_name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono truncate">{doc.doc_type}</div>
                            </div>
                          </div>

                          <div className="flex gap-2 pt-2 border-t border-white/5">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => setPreviewDoc(doc)}
                              className="flex-1 h-8 text-xs border-white/10 hover:bg-white/10 text-gray-200"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1 text-indigo-400" /> Preview
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => handleDownloadSingleDoc(doc.id, doc.file_name)}
                              className="flex-1 h-8 text-xs border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
                            >
                              <Download className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Download
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground font-mono text-xs bg-black/20 rounded-xl border border-white/5">
                      No standalone document file attachments found in registry.
                    </div>
                  )}
                </div>

                {/* 6. Direct Messaging with Seller (Admin ↔ Seller) */}
                <div className="p-5 sm:p-6 rounded-xl bg-[#12122b] border border-blue-500/30 space-y-4 xl:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
                    <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-blue-400" /> 6. Direct Admin ↔ Seller Messaging
                    </h3>
                    <span className="text-[10px] font-mono text-blue-300 bg-blue-500/10 px-2.5 py-1 rounded border border-blue-500/20">
                      Sender Identity: AUREVYXON Support
                    </span>
                  </div>

                  {/* Message Thread History */}
                  <div className="max-h-72 overflow-y-auto overscroll-y-contain touch-pan-y space-y-3 p-4 bg-black/40 rounded-xl border border-white/5 font-sans">
                    {threadMessages.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">
                        No previous message history with this seller. Send an official notice or inquiry below.
                      </p>
                    ) : (
                      threadMessages.map((msg) => {
                        const isAdminMsg = msg.sender_role === 'admin';
                        return (
                          <div 
                            key={msg.id} 
                            className={`p-3.5 rounded-xl max-w-[85%] text-xs ${
                              isAdminMsg 
                                ? 'ml-auto bg-indigo-600/30 border border-indigo-500/40 text-indigo-100' 
                                : 'mr-auto bg-[#1a1a38] border border-white/10 text-white'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 mb-1.5 border-b border-white/10 pb-1">
                              <span className="font-bold text-[11px] text-emerald-400">
                                {msg.sender_display_name || (isAdminMsg ? 'AUREVYXON Support' : 'Seller')}
                              </span>
                              <span className="text-[9px] font-mono text-muted-foreground">
                                {new Date(msg.created_at).toLocaleString()}
                              </span>
                            </div>
                            {msg.subject && (
                              <div className="font-semibold text-blue-300 text-[11px] mb-1">
                                Re: {msg.subject} ({msg.category})
                              </div>
                            )}
                            <p className="text-xs whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Message Composer */}
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">Category</label>
                        <select
                          value={msgCategory}
                          onChange={(e) => setMsgCategory(e.target.value)}
                          className="w-full bg-[#0D0D1E] border border-white/15 rounded-lg px-3 py-2 text-xs text-white"
                        >
                          <option value="General">General Notice</option>
                          <option value="KYC Update">KYC / Verification Query</option>
                          <option value="Payment Issue">Payout & Wallet Query</option>
                          <option value="Product Issue">Product Listing Moderation</option>
                          <option value="Account Issue">Account Policy Warning</option>
                          <option value="Technical Issue">Technical Support</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">Subject Header (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g. Identity Document Clarification..."
                          value={msgSubject}
                          onChange={(e) => setMsgSubject(e.target.value)}
                          className="w-full bg-[#0D0D1E] border border-white/15 rounded-lg px-3 py-2 text-xs text-white"
                        >
                        </input>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">Official Message Content</label>
                      <textarea
                        rows={3}
                        placeholder="Type your official message to this seller (dispatched directly to seller inbox & notification center)..."
                        value={msgText}
                        onChange={(e) => setMsgText(e.target.value)}
                        className="w-full bg-[#0D0D1E] border border-white/15 rounded-lg p-3 text-xs text-white resize-none"
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button
                        disabled={sendingMsg || !msgText.trim()}
                        onClick={handleAdminSendMessage}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-5 h-9"
                      >
                        <Send className="w-3.5 h-3.5 mr-1.5" /> Send Message to Seller
                      </Button>
                    </div>
                  </div>
                </div>

                {/* 7. Review & Decision Control Panel */}
                <div className="p-5 sm:p-6 rounded-xl bg-[#141432] border border-indigo-500/40 space-y-4 xl:col-span-2">
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" /> 7. Admin Review & Status Determination
                  </h3>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">Standard Rejection Reason (If rejecting)</label>
                      <select
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="w-full bg-[#0D0D1E] border border-white/15 rounded-lg px-3 py-2 text-xs text-white"
                      >
                        <option value="Blurry Document Image">Blurry / Unreadable Document Image</option>
                        <option value="Invalid Document Type">Invalid Document Type</option>
                        <option value="Expired ID / Tax Document">Expired ID / Tax Document</option>
                        <option value="Mismatch Name or Details">Name Mismatch with Payout Bank Account</option>
                        <option value="Missing Tax GSTIN/PAN">Missing Mandatory Tax ID / PAN</option>
                        <option value="Suspicious Identity Signal">Suspicious Fraud / Identity Risk Signal</option>
                        <option value="Other">Other Specific Reason</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">Admin Internal Remarks & Notes</label>
                      <input
                        type="text"
                        placeholder="Enter internal inspection notes, compliance comments, or specific rejection cause..."
                        className="w-full bg-[#0D0D1E] border border-white/15 rounded-lg px-3 py-2 text-xs text-white"
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-3 pt-3 border-t border-white/10">
                    <Button 
                      disabled={actionLoading}
                      onClick={() => handleAction("approve")} 
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 sm:px-5 h-9 justify-center"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5 shrink-0" /> Approve & Activate Seller
                    </Button>

                    <Button 
                      disabled={actionLoading}
                      onClick={() => handleAction("reject")} 
                      className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold px-4 sm:px-5 h-9 justify-center"
                    >
                      <XCircle className="w-4 h-4 mr-1.5 shrink-0" /> Reject Application
                    </Button>

                    <Button 
                      disabled={actionLoading}
                      onClick={() => handleAction("request_info")} 
                      variant="outline" 
                      className="border-blue-500/40 text-blue-300 hover:bg-blue-500/20 text-xs h-9 font-semibold justify-center"
                    >
                      Request Information
                    </Button>

                    <Button 
                      disabled={actionLoading}
                      onClick={() => handleAction("request_resubmission")} 
                      variant="outline" 
                      className="border-purple-500/40 text-purple-300 hover:bg-purple-500/20 text-xs h-9 font-semibold justify-center"
                    >
                      Request Document Resubmission
                    </Button>

                    <Button 
                      type="button"
                      disabled={actionLoading}
                      onClick={() => setReverificationModalOpen(true)} 
                      variant="outline" 
                      className="border-amber-500/40 text-amber-300 hover:bg-amber-500/20 text-xs h-9 font-bold justify-center"
                    >
                      <Clock className="w-4 h-4 mr-1.5 text-amber-400 shrink-0" /> Request Additional Verification
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="py-24 text-center text-red-400 font-mono text-sm">
              Seller profile dossier could not be loaded.
            </div>
          )}
          </div>
        </div>

      </div>

      <RequestAdditionalKycModal
        isOpen={reverificationModalOpen}
        onClose={() => setReverificationModalOpen(false)}
        sellerId={seller?.user_id || sellerId || ""}
        sellerName={seller?.display_name || seller?.legal_name}
        token={token}
        onSuccess={() => {
          fetchDetails();
          if (onRefreshList) onRefreshList();
        }}
      />

      {/* Document Preview Overlay Modal */}
      {previewDoc && (
        <div className="fixed inset-0 z-[10000] bg-black/90 flex items-center justify-center p-4">
          <div className="bg-[#121228] border border-indigo-500/40 rounded-2xl max-w-4xl w-full max-h-[90vh] p-5 flex flex-col space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <div>
                <h3 className="font-bold text-white text-base">{previewDoc.file_name}</h3>
                <p className="text-xs text-muted-foreground font-mono">{previewDoc.doc_type} ({previewDoc.doc_slot} side)</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => handleDownloadSingleDoc(previewDoc.id, previewDoc.file_name)} className="h-8 text-xs border-emerald-500/30 text-emerald-300">
                  <Download className="w-3.5 h-3.5 mr-1" /> Download
                </Button>
                <button onClick={() => setPreviewDoc(null)} className="text-gray-400 hover:text-white text-lg font-bold">✕</button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-black/50 rounded-xl p-4 flex items-center justify-center min-h-[300px]">
              {previewDoc.mime_type?.includes("pdf") ? (
                <iframe 
                  src={`/api/admin/advanced/kyc/document/${previewDoc.id}/preview`} 
                  className="w-full h-[500px] rounded-lg border border-white/10"
                  title="PDF Document Preview"
                />
              ) : (
                <img 
                  src={`/api/admin/advanced/kyc/document/${previewDoc.id}/preview`} 
                  alt={previewDoc.file_name} 
                  className="max-h-[500px] object-contain rounded-lg border border-white/10 shadow-lg"
                  onError={(e: any) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'block';
                  }}
                />
              )}
              <div className="hidden text-center text-muted-foreground font-mono text-xs">
                Unable to display image preview directly. Use the Download button to view file.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
