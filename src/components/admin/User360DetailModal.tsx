import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { 
  X, Download, Eye, EyeOff, ShieldCheck, ShieldAlert, FileText, 
  User, Building, CreditCard, RefreshCw, CheckCircle2, XCircle, 
  AlertCircle, FileSpreadsheet, FileJson, Printer, FolderArchive, 
  AlertTriangle, MessageSquare, Send, Clock, ShoppingBag, DollarSign,
  Star, HelpCircle, AlertOctagon, Laptop, Smartphone, Key, Lock,
  Unlock, LogOut, Trash2, Edit3, CheckCircle, ExternalLink, Shield,
  Mail, Phone, MapPin, Globe, ChevronRight, Hash, ArrowUpRight,
  FileCheck, Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RequestAdditionalKycModal } from "@/components/admin/RequestAdditionalKycModal";
import { persistSellerProfileToFirestore } from "@/lib/firestoreService";

interface User360DetailModalProps {
  userId: string | null;
  token: string;
  onClose: () => void;
  onRefreshList?: () => void;
}

export function User360DetailModal({ userId, token, onClose, onRefreshList }: User360DetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [userDetail, setUserDetail] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<
    'profile' | 'account' | 'kyc' | 'orders' | 'products' | 'earnings' | 'wallet' | 'refunds' | 'reviews' | 'messages' | 'support' | 'risk' | 'audit'
  >('profile');

  // Unmask Sensitive Data State
  const [showUnmasked, setShowUnmasked] = useState(false);

  // Document Image Zoom Preview
  const [previewDocUrl, setPreviewDocUrl] = useState<string | null>(null);

  // Reverification Modal State
  const [reverificationModalOpen, setReverificationModalOpen] = useState(false);

  // Profile Edit State
  const [editForm, setEditForm] = useState<any>({});
  const [savingProfile, setSavingProfile] = useState(false);

  // Admin Notes & Alerts
  const [internalNote, setInternalNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState('');
  const [sendingNotification, setSendingNotification] = useState(false);

  // Password Reset
  const [newPassword, setNewPassword] = useState('');
  const [resetPassResult, setResetPassResult] = useState<string | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);

  // Direct Messaging
  const [threadMessages, setThreadMessages] = useState<any[]>([]);
  const [msgCategory, setMsgCategory] = useState("General");
  const [msgSubject, setMsgSubject] = useState("");
  const [msgText, setMsgText] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  // KYC Actions
  const [kycRejectReason, setKycRejectReason] = useState("Blurry Document Image");
  const [kycActionLoading, setKycActionLoading] = useState(false);

  // Risk Override State
  const [riskScoreInput, setRiskScoreInput] = useState<number>(0);
  const [riskReason, setRiskReason] = useState("");
  const [updatingRisk, setUpdatingRisk] = useState(false);

  // Confirmation Modals
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'ban' | 'suspend' | 'verify' | 'force_logout' | 'delete' | null;
    title: string;
    description: string;
  }>({ open: false, type: null, title: '', description: '' });

  // Fetch full 360° details
  const fetchDetails = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/details`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to load user 360° profile");
      const data = await res.json();
      setUserDetail(data);
      setEditForm({
        name: data.profile?.name || '',
        username: data.profile?.username || '',
        email: data.profile?.email || '',
        phone_number: data.profile?.phone_number || '',
        country: data.profile?.country || 'US',
        address: data.profile?.address || '',
        city: data.profile?.city || '',
        postal_code: data.profile?.postal_code || '',
        bio: data.profile?.bio || '',
        role: data.profile?.role || 'user',
        commission_rate: data.wallet?.commission_rate || 0.25
      });
      setInternalNote(data.account?.admin_notes || '');
      setRiskScoreInput(data.security?.risk_score || data.security?.fraud_score || 0);
      setThreadMessages(data.directMessages || []);
    } catch (err: any) {
      toast.error(err.message || "Error fetching user details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [userId, token]);

  // Handle mask toggle
  const toggleUnmasked = () => {
    const nextState = !showUnmasked;
    setShowUnmasked(nextState);
    if (nextState) {
      toast.info("Unmasked sensitive credentials revealed. Action audit logged.");
    }
  };

  const maskValue = (val: string, fallback = "N/A") => {
    if (!val) return fallback;
    if (showUnmasked) return val;
    if (val.length <= 4) return "••••";
    return "•••• " + val.slice(-4);
  };

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

  // Perform User Action
  const handleUserAction = async (actionType: string, payload: any = {}) => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/${actionType}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Action failed");
      }

      const result = await res.json();
      toast.success(result.message || "Action completed successfully");

      if (actionType === 'password-reset') {
        setResetPassResult(result.temporary_password);
      } else if (actionType === 'delete') {
        onClose();
        if (onRefreshList) onRefreshList();
        return;
      }

      setConfirmDialog({ open: false, type: null, title: '', description: '' });
      fetchDetails();
      if (onRefreshList) onRefreshList();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Revoke single session
  const handleRevokeSession = async (sessionId: string) => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/sessions/${sessionId}/revoke`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to revoke session");
      toast.success("Session terminated and revoked.");
      fetchDetails();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Save profile updates
  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      await handleUserAction('edit', editForm);
    } finally {
      setSavingProfile(false);
    }
  };

  // Save internal notes
  const handleSaveNote = async () => {
    setSavingNote(true);
    try {
      await handleUserAction('note', { note: internalNote });
      toast.success("Internal admin note saved.");
    } finally {
      setSavingNote(false);
    }
  };

  // Send in-app notification
  const handleSendNotification = async () => {
    if (!notificationMsg.trim()) return toast.error("Notification message cannot be empty.");
    setSendingNotification(true);
    try {
      await handleUserAction('notify', { message: notificationMsg });
      setNotificationMsg('');
    } finally {
      setSendingNotification(false);
    }
  };

  // KYC Action (Approve / Reject / Request Info)
  const handleKycAction = async (action: string, reason?: string) => {
    if (!userId) return;
    if (action === 'reject' && !reason && !kycRejectReason) {
      return toast.error("Rejection reason is mandatory.");
    }

    setKycActionLoading(true);
    try {
      const targetSellerId = userDetail?.sellerProfile?.id || userId;
      const res = await fetch(`/api/admin/advanced/kyc/${targetSellerId}/action`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action,
          reason: reason || kycRejectReason || "Admin Compliance Decision",
          admin_notes: internalNote
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "KYC action failed");

      // Sync seller KYC status directly to Cloud Firestore collection 'sellers'
      await persistSellerProfileToFirestore({
        id: userId,
        user_id: userId,
        store_name: userDetail?.sellerProfile?.display_name || userDetail?.profile?.name || "Seller Store",
        kyc_status: action === 'approve' ? 'verified' : action === 'reject' ? 'rejected' : action,
        admin_notes: internalNote,
        rejection_reason: reason || kycRejectReason
      }).catch(err => console.warn("Firestore seller sync warning:", err));

      toast.success(data.message || `KYC status set to ${action}`);
      fetchDetails();
      if (onRefreshList) onRefreshList();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setKycActionLoading(false);
    }
  };

  // Direct Message Dispatch
  const handleSendMessage = async () => {
    if (!userId) return;
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
          seller_id: userId,
          category: msgCategory,
          subject: msgSubject || "Administrative Message",
          message: msgText
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send message");
      toast.success("Message dispatched to user.");
      setMsgText("");
      setMsgSubject("");
      fetchDetails();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSendingMsg(false);
    }
  };

  // Override Risk Score
  const handleUpdateRisk = async () => {
    setUpdatingRisk(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/risk-override`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          risk_score: riskScoreInput,
          reason: riskReason || "Manual Admin Risk Assessment"
        })
      });
      if (!res.ok) throw new Error("Failed to update risk score");
      toast.success("Risk score overridden successfully.");
      setRiskReason("");
      fetchDetails();
      if (onRefreshList) onRefreshList();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUpdatingRisk(false);
    }
  };

  // Download Dossier (CSV or JSON)
  const handleDownloadDossier = (format: 'csv' | 'json') => {
    if (!userId) return;
    const url = `/api/admin/users/${userId}/download-dossier?format=${format}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error("Download failed");
        const blob = await res.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = `User_360_Dossier_${userDetail?.profile?.username || userId}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success(`Exported complete 360° dossier in ${format.toUpperCase()} format.`);
      })
      .catch((err) => toast.error(err.message || "Failed to download dossier"));
  };

  const getRiskBadge = (score: number) => {
    if (score >= 50) return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> HIGH RISK ({score})</span>;
    if (score >= 20) return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> MEDIUM RISK ({score})</span>;
    return <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> LOW RISK ({score})</span>;
  };

  const getKycBadge = (status: string) => {
    const s = String(status || '').toLowerCase();
    if (s === 'verified') return <span className="px-2.5 py-0.5 text-xs font-bold uppercase rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Verified</span>;
    if (s === 'pending') return <span className="px-2.5 py-0.5 text-xs font-bold uppercase rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">Pending Review</span>;
    if (s === 'rejected') return <span className="px-2.5 py-0.5 text-xs font-bold uppercase rounded-md bg-rose-500/20 text-rose-400 border border-rose-500/30">Rejected</span>;
    return <span className="px-2.5 py-0.5 text-xs font-bold uppercase rounded-md bg-gray-500/20 text-gray-400 border border-gray-500/30">Unverified</span>;
  };

  const getStatusBadge = () => {
    if (userDetail?.account?.is_banned) return <span className="px-2.5 py-0.5 text-xs font-bold uppercase rounded-md bg-rose-500/20 text-rose-400 border border-rose-500/30">Banned</span>;
    if (userDetail?.account?.is_suspended) return <span className="px-2.5 py-0.5 text-xs font-bold uppercase rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">Suspended</span>;
    return <span className="px-2.5 py-0.5 text-xs font-bold uppercase rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Active</span>;
  };

  if (!userId || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-0 md:p-4 overflow-hidden animate-in fade-in duration-200">
      <div className="bg-[#0D0D1E] border-0 md:border md:border-indigo-500/30 rounded-none md:rounded-2xl w-full h-[100dvh] md:h-auto md:max-w-7xl md:max-h-[94vh] flex flex-col shadow-2xl text-white font-sans overflow-hidden">
        
        {/* =========================================================================
            HEADER: USER IDENTIFIER, BADGES & DOSSIER ACTIONS
        ========================================================================== */}
        <div className="bg-[#141428] border-b border-border/40 p-3 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-gradient-to-tr from-indigo-600 to-cyan-600 flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-indigo-600/30 shrink-0 border border-white/10 overflow-hidden">
              {userDetail?.profile?.avatar_url && userDetail.profile.avatar_url.trim() ? (
                <img src={userDetail.profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                userDetail?.profile?.name?.[0] || 'U'
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-xl font-bold text-white tracking-tight truncate">
                  {userDetail?.profile?.name || "Loading User..."}
                </h2>
                {userDetail?.account?.is_verified && (
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" title="Verified Badge Active" />
                )}
                <span className="px-2 py-0.5 text-[10px] sm:text-xs font-mono font-bold uppercase rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {userDetail?.profile?.role || 'BUYER'}
                </span>
                {getStatusBadge()}
                {getKycBadge(userDetail?.sellerProfile?.kyc_status || (userDetail?.account?.is_verified ? 'verified' : 'none'))}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground font-mono mt-0.5">
                <span>@{userDetail?.profile?.username || 'user'}</span>
                <span className="text-gray-600">•</span>
                <span className="truncate max-w-[200px] sm:max-w-none">{userDetail?.profile?.email}</span>
                <span className="text-gray-600">•</span>
                <span className="text-gray-400">ID: {(userDetail?.profile?.id || userId)?.slice(0, 16)}...</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {getRiskBadge(userDetail?.security?.risk_score || 0)}

            <Button
              size="sm"
              variant="outline"
              onClick={toggleUnmasked}
              className={`h-8 text-xs border-indigo-500/30 ${showUnmasked ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'text-indigo-300 hover:bg-indigo-500/20'}`}
              title={showUnmasked ? "Mask sensitive details" : "Unmask sensitive details (PAN, Bank, Phone)"}
            >
              {showUnmasked ? <EyeOff className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
              {showUnmasked ? "Mask Data" : "Unmask PII"}
            </Button>

            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownloadDossier('json')}
                className="h-8 text-xs border-gray-800 text-gray-300 hover:bg-white/5"
                title="Download JSON Dossier"
              >
                <FileJson className="w-3.5 h-3.5 mr-1 text-cyan-400" />
                <span className="hidden sm:inline">JSON</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDownloadDossier('csv')}
                className="h-8 text-xs border-gray-800 text-gray-300 hover:bg-white/5"
                title="Download CSV Dossier"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                <span className="hidden sm:inline">CSV</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.print()}
                className="h-8 text-xs border-gray-800 text-gray-300 hover:bg-white/5"
                title="Print Report"
              >
                <Printer className="w-3.5 h-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={fetchDetails}
                disabled={loading}
                className="h-8 w-8 p-0 text-gray-400 hover:text-white"
                title="Reload Live Data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onClose}
                className="h-8 w-8 p-0 rounded-full hover:bg-white/10 text-gray-400 hover:text-white ml-1"
                title="Close View"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* =========================================================================
            QUICK ACTIONS TOOLBAR
        ========================================================================== */}
        <div className="bg-[#0A0A16] border-b border-border/40 px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2 overflow-x-auto scrollbar-none shrink-0">
          <div className="flex items-center gap-1.5 whitespace-nowrap text-xs">
            <span className="text-muted-foreground font-mono mr-1 text-[11px]">ADMIN ACTIONS:</span>
            
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleUserAction('verify', { is_verified: !userDetail?.account?.is_verified })}
              className="h-7 text-xs border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20"
            >
              <ShieldCheck className="w-3 h-3 mr-1" />
              {userDetail?.account?.is_verified ? 'Revoke Verified' : 'Grant Verified'}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleUserAction('suspend', { is_suspended: !userDetail?.account?.is_suspended })}
              className={`h-7 text-xs ${userDetail?.account?.is_suspended ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20' : 'border-amber-500/40 text-amber-300 hover:bg-amber-500/20'}`}
            >
              {userDetail?.account?.is_suspended ? 'Unsuspend Account' : 'Suspend Account'}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleUserAction('ban', { is_banned: !userDetail?.account?.is_banned })}
              className={`h-7 text-xs ${userDetail?.account?.is_banned ? 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20' : 'border-rose-500/40 text-rose-300 hover:bg-rose-500/20'}`}
            >
              {userDetail?.account?.is_banned ? 'Unban User' : 'Ban User'}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleUserAction('force-logout')}
              className="h-7 text-xs border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
            >
              <LogOut className="w-3 h-3 mr-1" />
              Force Logout
            </Button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDialog({
                open: true,
                type: 'delete',
                title: 'Delete Account Permanently',
                description: `Are you sure you want to permanently delete user account ${userDetail?.profile?.name} (${userDetail?.profile?.email})? All associated listings and credentials will be removed.`
              })}
              className="h-7 text-xs text-red-400 hover:bg-red-500/20"
            >
              <Trash2 className="w-3 h-3 mr-1" /> Delete
            </Button>
          </div>
        </div>

        {/* =========================================================================
            NAVIGATION TABS (13 FULL 360° MODULES)
        ========================================================================== */}
        <div className="bg-[#101024] border-b border-border/40 px-3 sm:px-5 py-2 flex gap-1.5 overflow-x-auto scrollbar-none shrink-0">
          {[
            { id: 'profile', label: 'Profile', icon: User },
            { id: 'account', label: 'Account & Sessions', icon: ShieldCheck, count: userDetail?.sessions?.length },
            { id: 'kyc', label: `KYC & Verification`, icon: FileCheck, badge: userDetail?.sellerProfile?.kyc_status },
            { id: 'orders', label: 'Orders', icon: ShoppingBag, count: userDetail?.orders?.length },
            { id: 'products', label: 'Products', icon: FolderArchive, count: userDetail?.products?.length },
            { id: 'earnings', label: 'Sales & Earnings', icon: DollarSign },
            { id: 'wallet', label: 'Wallet & Payouts', icon: CreditCard, count: userDetail?.payoutRequests?.length },
            { id: 'refunds', label: 'Refunds & Disputes', icon: AlertTriangle, count: userDetail?.refunds?.length },
            { id: 'reviews', label: 'Reviews', icon: Star, count: (userDetail?.reviewsReceived?.length || 0) + (userDetail?.reviewsGiven?.length || 0) },
            { id: 'messages', label: 'Direct Messages', icon: MessageSquare, count: userDetail?.directMessages?.length },
            { id: 'support', label: 'Support Tickets', icon: HelpCircle, count: userDetail?.supportTickets?.length },
            { id: 'risk', label: 'Risk & Fraud', icon: AlertOctagon },
            { id: 'audit', label: 'Audit Log', icon: Clock, count: userDetail?.activity?.length }
          ].map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border border-indigo-400/40'
                    : 'bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white border border-transparent'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-indigo-400'}`} />
                <span>{t.label}</span>
                {t.count !== undefined && t.count > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isActive ? 'bg-white/20 text-white' : 'bg-black/40 text-muted-foreground'
                  }`}>
                    {t.count}
                  </span>
                )}
                {t.badge && (
                  <span className={`px-1.5 py-0.2 text-[9px] uppercase font-bold rounded ${
                    t.badge === 'verified' ? 'bg-emerald-500/20 text-emerald-300' :
                    t.badge === 'pending' ? 'bg-amber-500/20 text-amber-300' :
                    'bg-rose-500/20 text-rose-300'
                  }`}>
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* =========================================================================
            MAIN CONTENT AREA (SCROLLABLE)
        ========================================================================== */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 pb-32 sm:pb-24 space-y-6 bg-[#0D0D1E]/70 overscroll-contain">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-400" />
              <p className="text-sm font-mono text-muted-foreground">Loading complete user & seller 360° telemetry...</p>
            </div>
          ) : userDetail ? (
            <>
              {/* =================================================================
                  TAB 1: PROFILE
              ================================================================== */}
              {activeTab === 'profile' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left Column: Quick Profile Card */}
                    <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-4">
                      <div className="text-center space-y-2">
                        <div className="w-20 h-20 rounded-2xl bg-indigo-600/30 border-2 border-indigo-500/40 mx-auto flex items-center justify-center font-bold text-white text-3xl overflow-hidden shadow-xl">
                          {userDetail.profile?.avatar_url && userDetail.profile.avatar_url.trim() ? (
                            <img src={userDetail.profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            userDetail.profile?.name?.[0] || 'U'
                          )}
                        </div>
                        <h3 className="font-bold text-white text-lg">{userDetail.profile?.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">@{userDetail.profile?.username}</p>
                      </div>

                      <div className="pt-4 border-t border-border/40 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email:</span>
                          <span className="text-white font-mono">{userDetail.profile?.email}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Phone:</span>
                          <span className="text-white font-mono">{showUnmasked ? userDetail.profile?.phone_number : maskValue(userDetail.profile?.phone_number)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Country:</span>
                          <span className="text-white font-bold">{userDetail.profile?.country || 'US'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Registered:</span>
                          <span className="text-white">{new Date(userDetail.account?.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Last Login:</span>
                          <span className="text-emerald-400 font-mono">{userDetail.account?.last_login ? new Date(userDetail.account?.last_login).toLocaleString() : 'Recent'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Columns: Edit Full Profile Form */}
                    <div className="md:col-span-2 bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-4">
                      <div className="flex items-center justify-between border-b border-border/40 pb-3">
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <Edit3 className="w-4 h-4 text-indigo-400" /> Edit Profile Records
                        </h4>
                        <span className="text-xs text-muted-foreground font-mono">Live database synchronization</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div>
                          <label className="text-muted-foreground block mb-1 font-medium">Full Name</label>
                          <Input
                            value={editForm.name}
                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                            className="bg-black/50 border-gray-800 text-white text-xs h-9"
                          />
                        </div>
                        <div>
                          <label className="text-muted-foreground block mb-1 font-medium">Username</label>
                          <Input
                            value={editForm.username}
                            onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                            className="bg-black/50 border-gray-800 text-white text-xs h-9 font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-muted-foreground block mb-1 font-medium">Email Address</label>
                          <Input
                            value={editForm.email}
                            onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                            className="bg-black/50 border-gray-800 text-white text-xs h-9 font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-muted-foreground block mb-1 font-medium">Phone Number</label>
                          <Input
                            value={editForm.phone_number}
                            onChange={e => setEditForm({ ...editForm, phone_number: e.target.value })}
                            className="bg-black/50 border-gray-800 text-white text-xs h-9 font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-muted-foreground block mb-1 font-medium">Country</label>
                          <Input
                            value={editForm.country}
                            onChange={e => setEditForm({ ...editForm, country: e.target.value })}
                            className="bg-black/50 border-gray-800 text-white text-xs h-9"
                          />
                        </div>
                        <div>
                          <label className="text-muted-foreground block mb-1 font-medium">Account Role</label>
                          <select
                            value={editForm.role}
                            onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                            className="w-full bg-black/50 border border-gray-800 text-white text-xs rounded-md h-9 px-3"
                          >
                            <option value="user">User / Buyer</option>
                            <option value="seller">Seller / Creator</option>
                            <option value="admin">Administrator</option>
                            <option value="superadmin">Super Administrator</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-muted-foreground block mb-1 font-medium">Full Physical Address</label>
                          <Input
                            value={editForm.address}
                            onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                            placeholder="Street, Suite, Apt..."
                            className="bg-black/50 border-gray-800 text-white text-xs h-9"
                          />
                        </div>
                        <div>
                          <label className="text-muted-foreground block mb-1 font-medium">City</label>
                          <Input
                            value={editForm.city}
                            onChange={e => setEditForm({ ...editForm, city: e.target.value })}
                            className="bg-black/50 border-gray-800 text-white text-xs h-9"
                          />
                        </div>
                        <div>
                          <label className="text-muted-foreground block mb-1 font-medium">Postal / ZIP Code</label>
                          <Input
                            value={editForm.postal_code}
                            onChange={e => setEditForm({ ...editForm, postal_code: e.target.value })}
                            className="bg-black/50 border-gray-800 text-white text-xs h-9 font-mono"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-muted-foreground block mb-1 font-medium">Bio / Store Description</label>
                          <textarea
                            rows={3}
                            value={editForm.bio}
                            onChange={e => setEditForm({ ...editForm, bio: e.target.value })}
                            placeholder="User biography or business overview..."
                            className="w-full bg-black/50 border border-gray-800 text-white text-xs rounded-md p-2.5"
                          />
                        </div>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <Button
                          size="sm"
                          onClick={handleSaveProfile}
                          disabled={savingProfile}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5"
                        >
                          {savingProfile ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5" />}
                          Save Profile Changes
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* =================================================================
                  TAB 2: ACCOUNT & SESSIONS
              ================================================================== */}
              {activeTab === 'account' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  {/* Status & Security Metric Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-[#141428] p-4 rounded-xl border border-border/40 space-y-1">
                      <span className="text-xs text-muted-foreground block">Account Status</span>
                      <div className="text-base font-bold text-white">{getStatusBadge()}</div>
                    </div>
                    <div className="bg-[#141428] p-4 rounded-xl border border-border/40 space-y-1">
                      <span className="text-xs text-muted-foreground block">Auth Provider</span>
                      <span className="text-base font-bold text-indigo-300 uppercase font-mono">{userDetail.account?.provider || 'local'}</span>
                    </div>
                    <div className="bg-[#141428] p-4 rounded-xl border border-border/40 space-y-1">
                      <span className="text-xs text-muted-foreground block">Last Login IP</span>
                      <span className="text-base font-bold text-emerald-400 font-mono">{userDetail.account?.last_login_ip || '127.0.0.1'}</span>
                    </div>
                    <div className="bg-[#141428] p-4 rounded-xl border border-border/40 space-y-1">
                      <span className="text-xs text-muted-foreground block">Active Sessions</span>
                      <span className="text-base font-bold text-cyan-300">{userDetail.security?.active_sessions_count || 0} active</span>
                    </div>
                  </div>

                  {/* Sessions & Devices List */}
                  <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Laptop className="w-4 h-4 text-cyan-400" /> Active Devices & Authorization Sessions ({userDetail.sessions?.length || 0})
                      </h4>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUserAction('force-logout')}
                        className="h-7 text-xs border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
                      >
                        <LogOut className="w-3 h-3 mr-1" /> Revoke All Sessions
                      </Button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-black/50 text-muted-foreground font-mono">
                          <tr>
                            <th className="p-3">Device / Client</th>
                            <th className="p-3">IP Address</th>
                            <th className="p-3">Created</th>
                            <th className="p-3">Status</th>
                            <th className="p-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-sans">
                          {userDetail.sessions?.map((s: any) => (
                            <tr key={s.id} className="hover:bg-white/[0.02]">
                              <td className="p-3">
                                <div className="font-bold text-white flex items-center gap-2">
                                  {s.user_agent?.toLowerCase().includes('mobile') ? (
                                    <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
                                  ) : (
                                    <Laptop className="w-3.5 h-3.5 text-cyan-400" />
                                  )}
                                  <span className="truncate max-w-xs">{s.user_agent || 'Standard Web Session'}</span>
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono">Session ID: {s.id}</div>
                              </td>
                              <td className="p-3 font-mono text-emerald-400 font-bold">{s.ip_address || '127.0.0.1'}</td>
                              <td className="p-3 text-muted-foreground font-mono">{new Date(s.created_at).toLocaleString()}</td>
                              <td className="p-3">
                                {s.revoked ? (
                                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">REVOKED</span>
                                ) : (
                                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">ACTIVE</span>
                                )}
                              </td>
                              <td className="p-3 text-right">
                                {!s.revoked && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleRevokeSession(s.id)}
                                    className="h-7 text-[11px] text-rose-400 hover:bg-rose-500/20"
                                  >
                                    Revoke
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {(!userDetail.sessions || userDetail.sessions.length === 0) && (
                            <tr>
                              <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                No active session records stored in database
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Password Reset & Internal Notes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Password Reset */}
                    <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-3">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Key className="w-4 h-4 text-amber-400" /> Administrative Password Reset
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Generate an immediate replacement password for this user account.
                      </p>
                      <div className="space-y-2">
                        <Input
                          type="password"
                          placeholder="New temporary password (or leave blank to auto-generate)"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          className="bg-black/50 border-gray-800 text-white text-xs h-9"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleUserAction('password-reset', { new_password: newPassword })}
                          className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold w-full h-8"
                        >
                          Execute Password Reset
                        </Button>
                      </div>

                      {resetPassResult && (
                        <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono rounded-xl space-y-1">
                          <div className="font-bold">Password Reset Successful:</div>
                          <div className="p-2 bg-black/60 rounded text-center text-sm font-bold text-white select-all">
                            {resetPassResult}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Internal Notes */}
                    <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-3">
                      <h4 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                        <FileText className="w-4 h-4" /> Internal Administrative Notes
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        Confidential compliance notes, only visible to administrators.
                      </p>
                      <textarea
                        rows={3}
                        value={internalNote}
                        onChange={e => setInternalNote(e.target.value)}
                        placeholder="Add confidential compliance observations or flags..."
                        className="w-full bg-black/50 border border-gray-800 text-white text-xs p-2.5 rounded-lg"
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={handleSaveNote}
                          disabled={savingNote}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
                        >
                          {savingNote ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                          Save Note
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* =================================================================
                  TAB 3: KYC & VERIFICATION
              ================================================================== */}
              {activeTab === 'kyc' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  {/* Status Banner */}
                  <div className="bg-[#141428] p-5 rounded-2xl border border-indigo-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Seller KYC Status:</span>
                        {getKycBadge(userDetail.sellerProfile?.kyc_status || 'none')}
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/5 text-gray-300">
                          Role: <b className="text-indigo-300">{userDetail.profile?.role?.toUpperCase()}</b>
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {userDetail.sellerProfile?.kyc_status === 'verified'
                          ? "This user is an Approved Seller. They have full access to create products, sell on the marketplace, and request balance payouts."
                          : userDetail.sellerProfile?.kyc_status === 'pending'
                          ? "This user has submitted a Seller KYC Application and is currently awaiting your compliance review. Seller dashboard is locked until approved."
                          : userDetail.sellerProfile?.kyc_status === 'rejected'
                          ? `Application was Rejected. Reason: ${userDetail.sellerProfile?.kyc_rejection_reason || userDetail.sellerProfile?.admin_notes || 'Compliance criteria not met'}`
                          : "No seller KYC application submitted yet for this user."}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        disabled={kycActionLoading}
                        onClick={() => handleKycAction('approve')}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-lg shadow-emerald-900/30"
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve & Grant Seller
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={kycActionLoading}
                        onClick={() => handleKycAction('reject')}
                        className="text-xs font-bold shadow-lg shadow-rose-900/30"
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Reject KYC
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReverificationModalOpen(true)}
                        className="border-amber-500/40 text-amber-300 hover:bg-amber-500/20 text-xs font-bold"
                      >
                        <Clock className="w-3.5 h-3.5 mr-1 text-amber-400" /> Request Additional Info
                      </Button>
                    </div>
                  </div>

                  {/* KYC Data Grid: Identity, Business, Banking */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                    {/* Identity & Legal Info */}
                    <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-3">
                      <h4 className="font-bold text-indigo-300 flex items-center gap-2 uppercase tracking-wider text-xs border-b border-border/40 pb-2">
                        <User className="w-4 h-4 text-indigo-400" /> Identity & Contact
                      </h4>
                      <div className="space-y-2 text-gray-300">
                        <div className="flex justify-between"><span className="text-muted-foreground">Legal Name:</span> <b className="text-white">{userDetail.sellerProfile?.full_legal_name || userDetail.sellerProfile?.display_name || userDetail.profile?.name || 'N/A'}</b></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Date of Birth:</span> <span className="text-white">{userDetail.sellerProfile?.dob || 'N/A'}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">ID Type:</span> <span className="text-white">{userDetail.sellerProfile?.id_type || 'National ID'}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">National ID / PAN:</span> <span className="text-amber-300 font-mono font-bold">{showUnmasked ? (userDetail.sellerProfile?.national_id || userDetail.sellerProfile?.pan_number || userDetail.sellerProfile?.tax_id) : maskValue(userDetail.sellerProfile?.national_id || userDetail.sellerProfile?.pan_number || userDetail.sellerProfile?.tax_id)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Phone:</span> <span className="text-white font-mono">{showUnmasked ? (userDetail.sellerProfile?.phone || userDetail.profile?.phone_number) : maskValue(userDetail.sellerProfile?.phone || userDetail.profile?.phone_number)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Country:</span> <span className="text-white">{userDetail.sellerProfile?.country || userDetail.profile?.country || 'India'}</span></div>
                      </div>
                    </div>

                    {/* Tax & Business */}
                    <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-3">
                      <h4 className="font-bold text-cyan-300 flex items-center gap-2 uppercase tracking-wider text-xs border-b border-border/40 pb-2">
                        <Building className="w-4 h-4 text-cyan-400" /> Business & Tax
                      </h4>
                      <div className="space-y-2 text-gray-300">
                        <div className="flex justify-between"><span className="text-muted-foreground">Seller Type:</span> <b className="text-white uppercase">{userDetail.sellerProfile?.seller_type || 'individual'}</b></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Tax Country:</span> <span className="text-white">{userDetail.sellerProfile?.tax_country || 'India'}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Tax ID / PAN:</span> <span className="text-white font-mono">{showUnmasked ? (userDetail.sellerProfile?.tax_id || userDetail.sellerProfile?.pan_number) : maskValue(userDetail.sellerProfile?.tax_id || userDetail.sellerProfile?.pan_number)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">GSTIN / Reg No:</span> <span className="text-white font-mono">{showUnmasked ? (userDetail.sellerProfile?.gstin || userDetail.sellerProfile?.business_reg_number) : maskValue(userDetail.sellerProfile?.gstin || userDetail.sellerProfile?.business_reg_number)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Legal Business Name:</span> <span className="text-white">{userDetail.sellerProfile?.business_legal_name || 'N/A'}</span></div>
                      </div>
                    </div>

                    {/* Payout & Banking */}
                    <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-3">
                      <h4 className="font-bold text-emerald-300 flex items-center gap-2 uppercase tracking-wider text-xs border-b border-border/40 pb-2">
                        <CreditCard className="w-4 h-4 text-emerald-400" /> Payout & Banking
                      </h4>
                      <div className="space-y-2 text-gray-300">
                        <div className="flex justify-between"><span className="text-muted-foreground">Payout Method:</span> <b className="text-white uppercase">{userDetail.sellerProfile?.payout_method || 'bank'}</b></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Bank Name:</span> <span className="text-white">{userDetail.sellerProfile?.bank_name || 'N/A'}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Account Holder:</span> <span className="text-white">{userDetail.sellerProfile?.account_holder || 'N/A'}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Account Number:</span> <span className="text-emerald-400 font-mono font-bold">{showUnmasked ? userDetail.sellerProfile?.account_number : maskValue(userDetail.sellerProfile?.account_number)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">IFSC / Routing:</span> <span className="text-white font-mono">{showUnmasked ? userDetail.sellerProfile?.ifsc_code : maskValue(userDetail.sellerProfile?.ifsc_code)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">UPI ID:</span> <span className="text-cyan-300 font-mono">{showUnmasked ? userDetail.sellerProfile?.upi_id : maskValue(userDetail.sellerProfile?.upi_id)}</span></div>
                      </div>
                    </div>
                  </div>

                  {/* Documents Vault Viewer */}
                  <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-4">
                    <div className="flex items-center justify-between border-b border-border/40 pb-3">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-indigo-400" /> Submitted Identity Documents & Proofs
                      </h4>
                      <span className="text-xs text-muted-foreground">Click any document image to view full resolution</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {/* Document Front */}
                      <div className="bg-black/50 p-4 rounded-xl border border-white/5 space-y-2">
                        <span className="text-xs text-muted-foreground font-medium block">ID Document (Front / Main)</span>
                        {userDetail.sellerProfile?.id_document_front_url || userDetail.sellerProfile?.id_document_url ? (
                          <div className="space-y-2">
                            <div 
                              className="h-36 bg-black/60 rounded-lg border border-white/10 overflow-hidden cursor-pointer group relative flex items-center justify-center"
                              onClick={() => setPreviewDocUrl(userDetail.sellerProfile?.id_document_front_url || userDetail.sellerProfile?.id_document_url)}
                            >
                              <img 
                                src={userDetail.sellerProfile?.id_document_front_url || userDetail.sellerProfile?.id_document_url} 
                                alt="ID Document Front" 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity gap-1">
                                <Eye className="w-4 h-4" /> Expand Preview
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(userDetail.sellerProfile?.id_document_front_url || userDetail.sellerProfile?.id_document_url, '_blank')}
                              className="w-full h-7 text-[11px] border-gray-800"
                            >
                              <ExternalLink className="w-3 h-3 mr-1" /> Open Original Image
                            </Button>
                          </div>
                        ) : (
                          <div className="h-36 bg-white/5 rounded-lg border border-dashed border-gray-700 flex items-center justify-center text-gray-500 text-xs">
                            No front image uploaded
                          </div>
                        )}
                      </div>

                      {/* Document Back */}
                      <div className="bg-black/50 p-4 rounded-xl border border-white/5 space-y-2">
                        <span className="text-xs text-muted-foreground font-medium block">ID Document (Back / Secondary)</span>
                        {userDetail.sellerProfile?.id_document_back_url ? (
                          <div className="space-y-2">
                            <div 
                              className="h-36 bg-black/60 rounded-lg border border-white/10 overflow-hidden cursor-pointer group relative flex items-center justify-center"
                              onClick={() => setPreviewDocUrl(userDetail.sellerProfile?.id_document_back_url)}
                            >
                              <img 
                                src={userDetail.sellerProfile?.id_document_back_url} 
                                alt="ID Document Back" 
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity gap-1">
                                <Eye className="w-4 h-4" /> Expand Preview
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(userDetail.sellerProfile?.id_document_back_url, '_blank')}
                              className="w-full h-7 text-[11px] border-gray-800"
                            >
                              <ExternalLink className="w-3 h-3 mr-1" /> Open Original Image
                            </Button>
                          </div>
                        ) : (
                          <div className="h-36 bg-white/5 rounded-lg border border-dashed border-gray-700 flex items-center justify-center text-gray-500 text-xs">
                            No back image uploaded
                          </div>
                        )}
                      </div>

                      {/* Vault Document Records */}
                      <div className="bg-black/50 p-4 rounded-xl border border-white/5 space-y-2">
                        <span className="text-xs text-muted-foreground font-medium block">Additional Vaulted Records ({userDetail.kycDocuments?.length || 0})</span>
                        <div className="space-y-2 max-h-36 overflow-y-auto">
                          {userDetail.kycDocuments?.length > 0 ? (
                            userDetail.kycDocuments.map((doc: any) => (
                              <div key={doc.id} className="p-2 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between text-xs">
                                <div className="truncate mr-2">
                                  <div className="font-mono text-white truncate font-medium">{doc.file_name || doc.doc_type}</div>
                                  <div className="text-[10px] text-muted-foreground">{doc.doc_slot} • {doc.status}</div>
                                </div>
                                {doc.file_path && (
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    onClick={() => setPreviewDocUrl(doc.file_path)}
                                    className="h-7 w-7 p-0"
                                  >
                                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                                  </Button>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-gray-500 text-xs italic py-6 text-center">No secondary vault documents</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* =================================================================
                  TAB 4: ORDERS (PURCHASES)
              ================================================================== */}
              {activeTab === 'orders' && (
                <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-indigo-400" /> Purchase Order History ({userDetail.orders?.length || 0})
                    </h4>
                    <span className="text-xs text-muted-foreground font-mono">Total spend: ${(userDetail.orders?.reduce((acc: number, o: any) => acc + (o.amount || 0), 0) || 0).toFixed(2)}</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-black/50 text-muted-foreground font-mono">
                        <tr>
                          <th className="p-3">Order ID</th>
                          <th className="p-3">Product Title</th>
                          <th className="p-3">Amount</th>
                          <th className="p-3">Date</th>
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Listing</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-sans">
                        {userDetail.orders?.map((o: any) => (
                          <tr key={o.id} className="hover:bg-white/[0.02]">
                            <td className="p-3 font-mono text-muted-foreground">{o.id}</td>
                            <td className="p-3 font-medium text-white flex items-center gap-2">
                              {o.product_image && <img src={o.product_image} alt="" className="w-7 h-7 rounded object-cover border border-white/10" />}
                              <span>{o.product_title || 'Digital Product Asset'}</span>
                            </td>
                            <td className="p-3 text-emerald-400 font-bold font-mono">${(o.amount || 0).toFixed(2)}</td>
                            <td className="p-3 text-muted-foreground font-mono">{new Date(o.created_at).toLocaleDateString()}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                {o.status || 'PAID'}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              {o.listing_id && (
                                <a
                                  href={`/product/${o.listing_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-400 hover:underline flex items-center justify-end gap-1"
                                >
                                  View Item <ArrowUpRight className="w-3 h-3" />
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                        {(!userDetail.orders || userDetail.orders.length === 0) && (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-muted-foreground">
                              No purchase orders placed by this user
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* =================================================================
                  TAB 5: PRODUCTS (LISTINGS)
              ================================================================== */}
              {activeTab === 'products' && (
                <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <FolderArchive className="w-4 h-4 text-cyan-400" /> Published Marketplace Listings ({userDetail.products?.length || 0})
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {userDetail.products?.map((p: any) => (
                      <div key={p.id} className="bg-black/50 rounded-xl border border-border/40 p-3 space-y-3 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="h-32 bg-black/60 rounded-lg overflow-hidden border border-white/5 relative">
                            {(p.cover_image && p.cover_image.trim()) || (p.banner_image && p.banner_image.trim()) ? (
                              <img src={p.cover_image || p.banner_image} alt={p.title} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">No preview</div>
                            )}
                            <div className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-bold rounded uppercase bg-black/70 text-emerald-400 border border-emerald-500/30">
                              {p.status || 'ACTIVE'}
                            </div>
                          </div>
                          <h5 className="font-bold text-white text-xs truncate">{p.title}</h5>
                          <div className="flex items-center justify-between text-xs font-mono">
                            <span className="text-emerald-400 font-bold text-sm">${(p.price || 0).toFixed(2)}</span>
                            <span className="text-muted-foreground">{p.category || 'Digital Asset'}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Sales: <b className="text-white">{p.real_sales_count || p.sales_count || 0}</b></span>
                          <a
                            href={`/product/${p.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:underline flex items-center gap-1 font-bold"
                          >
                            Live Page <ArrowUpRight className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ))}
                    {(!userDetail.products || userDetail.products.length === 0) && (
                      <div className="col-span-3 p-12 text-center text-muted-foreground">
                        No marketplace listings published by this account
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* =================================================================
                  TAB 6: SALES & EARNINGS
              ================================================================== */}
              {activeTab === 'earnings' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  {/* Financial KPI Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-[#141428] p-4 rounded-xl border border-indigo-500/20 space-y-1">
                      <span className="text-xs text-muted-foreground block">Gross Marketplace Sales</span>
                      <span className="text-xl sm:text-2xl font-bold text-white font-mono">${(userDetail.financials?.grossSales || 0).toFixed(2)}</span>
                    </div>
                    <div className="bg-[#141428] p-4 rounded-xl border border-indigo-500/20 space-y-1">
                      <span className="text-xs text-muted-foreground block">Platform Commissions Deducted</span>
                      <span className="text-xl sm:text-2xl font-bold text-indigo-400 font-mono">${(userDetail.financials?.platformCommissions || 0).toFixed(2)}</span>
                    </div>
                    <div className="bg-[#141428] p-4 rounded-xl border border-emerald-500/20 space-y-1">
                      <span className="text-xs text-muted-foreground block">Net Seller Earnings</span>
                      <span className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono">${(userDetail.financials?.netSellerEarnings || 0).toFixed(2)}</span>
                    </div>
                    <div className="bg-[#141428] p-4 rounded-xl border border-cyan-500/20 space-y-1">
                      <span className="text-xs text-muted-foreground block">Withdrawable Balance</span>
                      <span className="text-xl sm:text-2xl font-bold text-cyan-400 font-mono">${(userDetail.financials?.availableSellerBalance || 0).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Sales Transactions Ledger */}
                  <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-4">
                    <div className="flex items-center justify-between border-b border-border/40 pb-3">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-emerald-400" /> Sales Transaction Records ({userDetail.sales?.length || 0})
                      </h4>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-black/50 text-muted-foreground font-mono">
                          <tr>
                            <th className="p-3">Tx ID</th>
                            <th className="p-3">Buyer</th>
                            <th className="p-3">Product</th>
                            <th className="p-3">Gross</th>
                            <th className="p-3">Platform Fee</th>
                            <th className="p-3">Net Seller</th>
                            <th className="p-3">Date</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-sans">
                          {userDetail.sales?.map((s: any) => (
                            <tr key={s.id} className="hover:bg-white/[0.02]">
                              <td className="p-3 font-mono text-muted-foreground">{s.id}</td>
                              <td className="p-3 text-white font-medium">{s.buyer_name || s.buyer_email || 'Customer'}</td>
                              <td className="p-3 text-gray-300 font-medium">{s.product_title || 'Item'}</td>
                              <td className="p-3 text-white font-mono font-bold">${(s.amount || 0).toFixed(2)}</td>
                              <td className="p-3 text-indigo-400 font-mono">-${(s.platform_fee || 0).toFixed(2)}</td>
                              <td className="p-3 text-emerald-400 font-mono font-bold">+${(s.seller_earnings || 0).toFixed(2)}</td>
                              <td className="p-3 text-muted-foreground font-mono">{new Date(s.created_at).toLocaleDateString()}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  {s.status || 'COMPLETED'}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {(!userDetail.sales || userDetail.sales.length === 0) && (
                            <tr>
                              <td colSpan={8} className="p-6 text-center text-muted-foreground">
                                No sales transactions recorded for this seller
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* =================================================================
                  TAB 7: WALLET & PAYOUTS
              ================================================================== */}
              {activeTab === 'wallet' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[#141428] p-4 rounded-xl border border-emerald-500/20">
                      <span className="text-xs text-muted-foreground block">Seller Balance</span>
                      <span className="text-2xl font-bold text-emerald-400 font-mono">${(userDetail.wallet?.seller_balance || 0).toFixed(2)}</span>
                    </div>
                    <div className="bg-[#141428] p-4 rounded-xl border border-cyan-500/20">
                      <span className="text-xs text-muted-foreground block">Total Payouts Dispatched</span>
                      <span className="text-2xl font-bold text-cyan-400 font-mono">${(userDetail.financials?.totalPaidOut || 0).toFixed(2)}</span>
                    </div>
                    <div className="bg-[#141428] p-4 rounded-xl border border-indigo-500/20">
                      <span className="text-xs text-muted-foreground block">Platform Commission Rate</span>
                      <span className="text-2xl font-bold text-indigo-400 font-mono">{((userDetail.wallet?.commission_rate || 0.25) * 100).toFixed(0)}%</span>
                    </div>
                  </div>

                  {/* Payout History */}
                  <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-4">
                    <div className="flex items-center justify-between border-b border-border/40 pb-3">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-emerald-400" /> Payout Withdrawal History ({userDetail.payoutRequests?.length || 0})
                      </h4>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-black/50 text-muted-foreground font-mono">
                          <tr>
                            <th className="p-3">Request ID</th>
                            <th className="p-3">Amount</th>
                            <th className="p-3">Method / Details</th>
                            <th className="p-3">Requested Date</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-sans">
                          {userDetail.payoutRequests?.map((p: any) => (
                            <tr key={p.id} className="hover:bg-white/[0.02]">
                              <td className="p-3 font-mono text-muted-foreground">{p.id}</td>
                              <td className="p-3 font-mono text-emerald-400 font-bold">${(p.amount || 0).toFixed(2)}</td>
                              <td className="p-3 text-white">
                                <span className="font-bold uppercase">{p.payout_method || 'BANK'}</span>
                                <span className="text-muted-foreground ml-1">({showUnmasked ? (p.account_number || p.upi_id || p.details) : maskValue(p.account_number || p.upi_id || p.details)})</span>
                              </td>
                              <td className="p-3 text-muted-foreground font-mono">{new Date(p.created_at).toLocaleDateString()}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                                  p.status === 'completed' || p.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                  p.status === 'pending' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                  'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                }`}>
                                  {p.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {(!userDetail.payoutRequests || userDetail.payoutRequests.length === 0) && (
                            <tr>
                              <td colSpan={5} className="p-6 text-center text-muted-foreground">
                                No payout requests submitted by this account
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* =================================================================
                  TAB 8: REFUNDS & DISPUTES
              ================================================================== */}
              {activeTab === 'refunds' && (
                <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400" /> Refund & Dispute History ({userDetail.refunds?.length || 0})
                    </h4>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-black/50 text-muted-foreground font-mono">
                        <tr>
                          <th className="p-3">Dispute ID</th>
                          <th className="p-3">Item / Product</th>
                          <th className="p-3">Amount</th>
                          <th className="p-3">Reason</th>
                          <th className="p-3">Date</th>
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-sans">
                        {userDetail.refunds?.map((r: any) => (
                          <tr key={r.id} className="hover:bg-white/[0.02]">
                            <td className="p-3 font-mono text-muted-foreground">{r.id}</td>
                            <td className="p-3 text-white font-medium">{r.product_title || 'Item'}</td>
                            <td className="p-3 text-amber-400 font-mono font-bold">${(r.amount || 0).toFixed(2)}</td>
                            <td className="p-3 text-gray-300">{r.reason || 'Customer Request'}</td>
                            <td className="p-3 text-muted-foreground font-mono">{new Date(r.created_at).toLocaleDateString()}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-white/5 text-gray-300">
                                {r.status || 'CLOSED'}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {(!userDetail.refunds || userDetail.refunds.length === 0) && (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-muted-foreground">
                              No refund or dispute records found
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* =================================================================
                  TAB 9: REVIEWS
              ================================================================== */}
              {activeTab === 'reviews' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-4">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2 border-b border-border/40 pb-3">
                      <Star className="w-4 h-4 text-amber-400" /> Reviews Received as Seller ({userDetail.reviewsReceived?.length || 0})
                    </h4>

                    <div className="space-y-3">
                      {userDetail.reviewsReceived?.map((rev: any) => (
                        <div key={rev.id} className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="flex text-amber-400 text-xs">
                                {'★'.repeat(rev.rating || 5)}{'☆'.repeat(5 - (rev.rating || 5))}
                              </div>
                              <span className="font-bold text-white text-xs">{rev.author_name || 'Customer'}</span>
                              <span className="text-muted-foreground text-[11px]">on {rev.product_title}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono">{new Date(rev.created_at).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs text-gray-300">{rev.comment || 'No textual comment provided.'}</p>
                        </div>
                      ))}
                      {(!userDetail.reviewsReceived || userDetail.reviewsReceived.length === 0) && (
                        <p className="text-xs text-muted-foreground text-center py-4">No reviews received yet</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* =================================================================
                  TAB 10: DIRECT MESSAGES
              ================================================================== */}
              {activeTab === 'messages' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-4">
                    <div className="flex items-center justify-between border-b border-border/40 pb-3">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-cyan-400" /> Admin ↔ User Real Conversation Stream
                      </h4>
                      <span className="text-xs text-muted-foreground font-mono">{threadMessages.length} messages</span>
                    </div>

                    {/* Messages Thread Viewer */}
                    <div className="h-64 overflow-y-auto space-y-3 p-3 bg-black/40 rounded-xl border border-white/5">
                      {threadMessages.map((m: any, idx: number) => {
                        const isAdmin = m.sender_role === 'admin' || m.sender_role === 'superadmin' || m.sender_id !== userId;
                        return (
                          <div key={m.id || idx} className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-md p-3 rounded-xl text-xs space-y-1 ${
                              isAdmin ? 'bg-indigo-600/90 text-white rounded-br-none' : 'bg-[#1C1C36] text-gray-200 rounded-bl-none border border-white/10'
                            }`}>
                              <div className="flex items-center justify-between gap-4 text-[10px] opacity-80 font-mono">
                                <span>{isAdmin ? 'Admin Compliance Desk' : (m.sender_name || 'User')}</span>
                                <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              {m.subject && <div className="font-bold text-xs">{m.subject}</div>}
                              <div className="text-xs whitespace-pre-wrap">{m.message}</div>
                            </div>
                          </div>
                        );
                      })}
                      {threadMessages.length === 0 && (
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                          No prior direct communication messages found in thread
                        </div>
                      )}
                    </div>

                    {/* Message Composition Box */}
                    <div className="space-y-3 pt-2">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Category</label>
                          <select
                            value={msgCategory}
                            onChange={e => setMsgCategory(e.target.value)}
                            className="w-full bg-black/50 border border-gray-800 text-white text-xs rounded-md h-8 px-2"
                          >
                            <option value="General">General Inquiry</option>
                            <option value="KYC Verification">KYC & Compliance</option>
                            <option value="Security Alert">Security Notice</option>
                            <option value="Payout Inquiry">Payout & Finance</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs text-muted-foreground block mb-1">Subject</label>
                          <Input
                            placeholder="Message subject..."
                            value={msgSubject}
                            onChange={e => setMsgSubject(e.target.value)}
                            className="bg-black/50 border-gray-800 text-white text-xs h-8"
                          />
                        </div>
                      </div>

                      <div>
                        <textarea
                          rows={3}
                          placeholder="Type official communication message to deliver to this user's inbox..."
                          value={msgText}
                          onChange={e => setMsgText(e.target.value)}
                          className="w-full bg-black/50 border border-gray-800 text-white text-xs p-2.5 rounded-lg"
                        />
                      </div>

                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={handleSendMessage}
                          disabled={sendingMsg}
                          className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold px-4"
                        >
                          {sendingMsg ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                          Dispatch Message
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* =================================================================
                  TAB 11: SUPPORT TICKETS
              ================================================================== */}
              {activeTab === 'support' && (
                <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-amber-400" /> Support Ticket Inquiries ({userDetail.supportTickets?.length || 0})
                    </h4>
                  </div>

                  <div className="space-y-2">
                    {userDetail.supportTickets?.map((t: any) => (
                      <div key={t.id} className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-center justify-between text-xs">
                        <div className="space-y-1">
                          <div className="font-bold text-white flex items-center gap-2">
                            <span>{t.subject}</span>
                            <span className="px-2 py-0.2 text-[10px] uppercase font-bold rounded bg-indigo-500/20 text-indigo-300">
                              {t.priority || 'NORMAL'}
                            </span>
                          </div>
                          <div className="text-muted-foreground text-[11px] font-mono">Ticket #{t.id} • {new Date(t.created_at).toLocaleDateString()}</div>
                        </div>
                        <span className="px-2.5 py-0.5 text-xs font-bold uppercase rounded bg-white/10 text-white">
                          {t.status || 'OPEN'}
                        </span>
                      </div>
                    ))}
                    {(!userDetail.supportTickets || userDetail.supportTickets.length === 0) && (
                      <p className="text-xs text-muted-foreground text-center py-6">No support tickets submitted</p>
                    )}
                  </div>
                </div>
              )}

              {/* =================================================================
                  TAB 12: RISK & FRAUD
              ================================================================== */}
              {activeTab === 'risk' && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Risk Telemetry Card */}
                    <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-4">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2 border-b border-border/40 pb-3">
                        <AlertOctagon className="w-4 h-4 text-rose-400" /> Risk & Fraud Assessment Telemetry
                      </h4>

                      <div className="space-y-3 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Computed Risk Score:</span>
                          <div>{getRiskBadge(userDetail.security?.risk_score || 0)}</div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Fraud Score Flag:</span>
                          <span className="font-mono text-white font-bold">{userDetail.security?.fraud_score || 0} / 100</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Last Login IP Address:</span>
                          <span className="font-mono text-emerald-400 font-bold">{userDetail.account?.last_login_ip || '127.0.0.1'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Total Devices Fingerprinted:</span>
                          <span className="font-mono text-white">{userDetail.security?.total_sessions_count || 1}</span>
                        </div>
                      </div>
                    </div>

                    {/* Manual Risk Override Control */}
                    <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-4">
                      <h4 className="text-sm font-bold text-amber-300 flex items-center gap-2 border-b border-border/40 pb-3">
                        <ShieldAlert className="w-4 h-4" /> Override Risk Score
                      </h4>

                      <div className="space-y-3 text-xs">
                        <div>
                          <label className="text-muted-foreground block mb-1">Set Risk Score (0 = Clean, 100 = Critical Fraud)</label>
                          <div className="flex items-center gap-3">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={riskScoreInput}
                              onChange={e => setRiskScoreInput(Number(e.target.value))}
                              className="flex-1 accent-indigo-500"
                            />
                            <span className="font-mono font-bold text-white text-base w-10 text-right">{riskScoreInput}</span>
                          </div>
                        </div>

                        <div>
                          <label className="text-muted-foreground block mb-1">Audit Justification</label>
                          <Input
                            placeholder="Reason for manual score override..."
                            value={riskReason}
                            onChange={e => setRiskReason(e.target.value)}
                            className="bg-black/50 border-gray-800 text-white text-xs h-8"
                          />
                        </div>

                        <div className="pt-2 flex justify-end">
                          <Button
                            size="sm"
                            onClick={handleUpdateRisk}
                            disabled={updatingRisk}
                            className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
                          >
                            {updatingRisk ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                            Save Risk Override
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* =================================================================
                  TAB 13: AUDIT LOG
              ================================================================== */}
              {activeTab === 'audit' && (
                <div className="bg-[#141428] p-5 rounded-2xl border border-border/40 space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-border/40 pb-3">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-400" /> Permanent Account Audit History ({userDetail.activity?.length || 0})
                    </h4>
                    <span className="text-xs text-muted-foreground font-mono">Immutable audit records</span>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {userDetail.activity?.map((a: any) => (
                      <div key={a.id} className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-center justify-between text-xs">
                        <div className="space-y-1">
                          <span className="font-bold text-indigo-300 block">{a.title}</span>
                          {a.description && <p className="text-[11px] text-gray-400">{typeof a.description === 'object' ? JSON.stringify(a.description) : a.description}</p>}
                        </div>
                        <div className="text-right text-[10px] font-mono text-muted-foreground shrink-0 ml-4">
                          <div>{new Date(a.timestamp).toLocaleString()}</div>
                          {a.admin_id && <div className="text-gray-500">By Admin: {a.admin_id.slice(0, 8)}</div>}
                        </div>
                      </div>
                    ))}
                    {(!userDetail.activity || userDetail.activity.length === 0) && (
                      <p className="text-xs text-muted-foreground text-center py-6">No administrative audit events recorded yet</p>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* =========================================================================
            FOOTER: QUICK STATS & CLOSE
        ========================================================================== */}
        <div className="bg-[#141428] border-t border-border/40 px-5 py-3 flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <div className="font-mono text-[11px]">
            User ID: <span className="text-white font-bold">{userDetail?.profile?.id}</span>
          </div>

          <Button
            size="sm"
            onClick={onClose}
            className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-6"
          >
            Close Detail View
          </Button>
        </div>
      </div>

      {/* =========================================================================
          CONFIRMATION DIALOG MODAL
      ========================================================================== */}
      <Dialog open={confirmDialog.open} onOpenChange={(o) => !o && setConfirmDialog({ open: false, type: null, title: '', description: '' })}>
        <DialogContent className="bg-[#141428] border border-rose-500/30 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" /> {confirmDialog.title}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-xs text-gray-300">
            {confirmDialog.description}
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmDialog({ open: false, type: null, title: '', description: '' })}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (confirmDialog.type === 'delete') {
                  handleUserAction('delete');
                }
              }}
            >
              Confirm Permanent Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          DOCUMENT PREVIEW FULL ZOOM MODAL
      ========================================================================== */}
      <Dialog open={!!previewDocUrl} onOpenChange={(o) => !o && setPreviewDocUrl(null)}>
        <DialogContent className="bg-black/95 border border-indigo-500/30 text-white max-w-4xl w-[95vw] max-h-[90vh] flex flex-col p-4">
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-white/10">
            <DialogTitle className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-400" /> Identity Document Full Preview
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 flex items-center justify-center p-2 overflow-auto">
            {previewDocUrl && (
              <img 
                src={previewDocUrl} 
                alt="Document Full View" 
                className="max-h-[75vh] w-auto max-w-full object-contain rounded-lg border border-white/10 shadow-2xl" 
              />
            )}
          </div>
          <DialogFooter className="pt-2 border-t border-white/10 flex justify-between">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(previewDocUrl || '', '_blank')}
              className="text-xs"
            >
              Open in New Tab
            </Button>
            <Button
              size="sm"
              onClick={() => setPreviewDocUrl(null)}
              className="bg-indigo-600 text-xs font-bold"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          REQUEST ADDITIONAL KYC MODAL
      ========================================================================== */}
      <RequestAdditionalKycModal
        isOpen={reverificationModalOpen}
        onClose={() => setReverificationModalOpen(false)}
        sellerId={userDetail?.profile?.id || userDetail?.sellerProfile?.user_id || userDetail?.sellerProfile?.id || ""}
        sellerName={userDetail?.profile?.name || userDetail?.sellerProfile?.display_name}
        token={token}
        onSuccess={() => {
          fetchDetails();
          if (onRefreshList) onRefreshList();
        }}
      />
    </div>,
    document.body
  );
}
