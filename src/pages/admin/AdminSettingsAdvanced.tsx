import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { updateUniversalProfile, validateProfileImage, updateWebsiteLogo } from "@/lib/storageService";
import { ImageCropModal } from "@/components/ImageCropModal";
import { ProcessedImageResult } from "@/lib/imageProcessor";
import { 
  Settings, DollarSign, Shield, Bell, Users, Store, CreditCard, 
  Globe, Mail, Lock, CheckCircle2, AlertTriangle, FileCode, Layers, Save,
  Calculator, Loader2, Clock, QrCode, Wallet, Building2, Coins, Eye, EyeOff,
  Copy, Check, Zap, ToggleLeft, ToggleRight, Key, Plus, Trash2, Edit3,
  ArrowUp, ArrowDown, Send, X, Code, Eye as EyeIcon, Database, User, Camera, Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALL_COUNTRIES_DATA } from "@/lib/countriesData";

interface AdminSettingsAdvancedProps {
  token: string;
}

function AdminProfileSection({ token }: { token: string }) {
  const { user, refreshUser } = useAuth();
  const [adminName, setAdminName] = useState(user?.name || "System Admin");
  const [saving, setSaving] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [processedImage, setProcessedImage] = useState<ProcessedImageResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRemovePhoto, setIsRemovePhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.name) setAdminName(user.name);
  }, [user]);

  const currentAvatar = isRemovePhoto ? "" : previewUrl || user?.photoURL || user?.avatar_url || "";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateProfileImage(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setCropFile(file);
    setIsCropOpen(true);
  };

  const handleCropComplete = (result: ProcessedImageResult) => {
    setProcessedImage(result);
    setSelectedFile(cropFile);
    setIsRemovePhoto(false);
    const url = URL.createObjectURL(result.fullBlob);
    setPreviewUrl(url);
    toast.success("Admin avatar cropped & processed!");
  };

  const handleRemovePhoto = () => {
    setSelectedFile(null);
    setProcessedImage(null);
    setPreviewUrl(null);
    setIsRemovePhoto(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCancelImageSelection = () => {
    setSelectedFile(null);
    setProcessedImage(null);
    setPreviewUrl(null);
    setIsRemovePhoto(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSaveAdminProfile = async () => {
    if (!adminName.trim()) {
      toast.error("Admin name cannot be empty.");
      return;
    }

    setSaving(true);
    try {
      await updateUniversalProfile({
        uid: user?.id,
        displayName: adminName,
        file: selectedFile,
        processedImage,
        isRemovePhoto,
        role: "admin",
        token
      });

      await refreshUser();
      setSelectedFile(null);
      setProcessedImage(null);
      setPreviewUrl(null);
      setIsRemovePhoto(false);
      toast.success("Admin Profile & Avatar saved successfully to Firebase Storage & Firestore!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to update Admin Profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#101020] border border-indigo-500/30 rounded-xl p-6 space-y-6">
      <div>
        <h3 className="font-bold text-white text-base flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-400" />
          Admin Profile & Avatar Management (AUREVYXON)
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Update Admin Name and Profile Picture with permanent Firebase Storage & Firestore persistence.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-white/5 rounded-xl border border-white/10">
        <div className="relative group">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-indigo-600 to-cyan-600 flex items-center justify-center text-white font-bold text-3xl border-2 border-cyan-400/50 shadow-2xl">
            {currentAvatar ? (
              <img src={currentAvatar} alt={adminName || "Admin Avatar"} className="w-full h-full object-cover" />
            ) : (
              adminName?.charAt(0)?.toUpperCase() || "A"
            )}
          </div>
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 p-2 rounded-full bg-cyan-600 text-white shadow-lg hover:bg-cyan-500 transition-all"
            title="Upload Admin Avatar"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 text-center sm:text-left space-y-2">
          <h4 className="font-semibold text-white text-base">Admin Avatar</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Supported Formats: <span className="text-cyan-300 font-mono font-bold">PNG, JPG, JPEG</span> (Max file size: <span className="text-cyan-300 font-mono font-bold">5MB</span>).
          </p>

          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/*,.png,.jpg,.jpeg,.webp,.gif,application/*,*/*" 
            onChange={handleFileChange} 
            className="hidden" 
          />

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={() => fileInputRef.current?.click()}
              className="border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/20 text-xs gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Avatar
            </Button>

            {(selectedFile || previewUrl) && (
              <Button 
                type="button" 
                variant="ghost" 
                size="sm" 
                onClick={handleCancelImageSelection}
                className="text-xs text-gray-400 hover:text-white gap-1"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </Button>
            )}

            {(user?.photoURL || user?.avatar_url || currentAvatar) && !isRemovePhoto && (
              <Button 
                type="button" 
                variant="destructive" 
                size="sm" 
                onClick={handleRemovePhoto}
                className="bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 text-xs gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove Photo
              </Button>
            )}
          </div>

          {selectedFile && (
            <p className="text-xs text-cyan-400 font-mono mt-1">
              ✓ Ready to upload: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
            </p>
          )}

          {isRemovePhoto && (
            <p className="text-xs text-amber-400 font-mono mt-1">
              ⚠️ Photo marked for removal upon saving.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs uppercase font-mono text-muted-foreground block mb-1">Admin Display Name</label>
          <input
            type="text"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            className="w-full bg-[#141428] border border-border rounded p-2.5 text-xs text-white"
            placeholder="Enter Admin Name"
          />
        </div>

        <div>
          <label className="text-xs uppercase font-mono text-muted-foreground block mb-1">Admin Authorized Email (Read Only)</label>
          <input
            type="email"
            value={user?.email || "admin@aurevyxon.com"}
            disabled
            className="w-full bg-[#141428] border border-border/50 rounded p-2.5 text-xs text-gray-500 cursor-not-allowed"
          />
        </div>

        <Button 
          onClick={handleSaveAdminProfile} 
          disabled={saving} 
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-6 rounded-lg shadow-lg shadow-indigo-600/30"
        >
          {saving ? "Uploading & Saving Admin Avatar..." : "Save Admin Profile Changes"}
        </Button>

        <ImageCropModal
          isOpen={isCropOpen}
          file={cropFile}
          onClose={() => setIsCropOpen(false)}
          onCropComplete={handleCropComplete}
        />
      </div>
    </div>
  );
}

function WebsiteLogoSection({ token }: { token: string }) {
  const { user } = useAuth();
  const [currentLogo, setCurrentLogo] = useState<string>(() => {
    return localStorage.getItem("aurevyxon_site_logo") || "";
  });
  const [saving, setSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [processedImage, setProcessedImage] = useState<ProcessedImageResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/site-settings")
      .then(res => res.json())
      .then(data => {
        if (data.logo_url) {
          setCurrentLogo(data.logo_url);
          localStorage.setItem("aurevyxon_site_logo", data.logo_url);
        }
      })
      .catch(() => {});
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateProfileImage(file);
    if (!validation.valid) {
      toast.error(validation.error || "Invalid file format");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setCropFile(file);
    setIsCropOpen(true);
  };

  const handleCropComplete = (result: ProcessedImageResult) => {
    setProcessedImage(result);
    setSelectedFile(cropFile);
    const url = URL.createObjectURL(result.fullBlob);
    setPreviewUrl(url);
    toast.success("Website icon cropped & processed!");
  };

  const handleSaveLogo = async () => {
    if (!selectedFile && !processedImage) {
      toast.error("Please select a PNG or JPG file for the website logo.");
      return;
    }

    setSaving(true);
    try {
      const authToken = token || localStorage.getItem("aurevyxon_token") || "";
      const newLogoUrl = await updateWebsiteLogo({
        file: selectedFile,
        processedImage,
        uid: user?.id,
        token: authToken
      });

      setCurrentLogo(newLogoUrl);
      setSelectedFile(null);
      setProcessedImage(null);
      setPreviewUrl(null);
      toast.success("Website Logo & Icon updated successfully in PNG/JPG format!");
    } catch (err: any) {
      console.error("Failed to update logo:", err);
      toast.error(err.message || "Failed to upload website logo.");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = async () => {
    setSaving(true);
    try {
      const authToken = token || localStorage.getItem("aurevyxon_token") || "";
      const res = await fetch("/api/admin/site-logo/reset", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      const defaultLogo = data.logo_url || "/assets/images/market_logo_1784884442864.jpg";

      localStorage.removeItem("aurevyxon_site_logo");
      window.dispatchEvent(new CustomEvent("site_logo_updated", { detail: defaultLogo }));
      setCurrentLogo(defaultLogo);
      setSelectedFile(null);
      setProcessedImage(null);
      setPreviewUrl(null);
      toast.success("Reset website logo to system default.");
    } catch (e: any) {
      toast.error("Failed to reset logo: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#101020] border border-cyan-500/30 rounded-xl p-6 space-y-4">
      <div>
        <h3 className="font-bold text-white text-base flex items-center gap-2">
          <Globe className="w-5 h-5 text-cyan-400" />
          Website Brand Logo & Favicon Management (PNG / JPG / JPEG)
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Upload and set your custom website icon in PNG or JPG format. Uploaded logo will automatically propagate across the header, navigation, and all system cards.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-white/5 rounded-xl border border-white/10">
        <div className="relative group">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-black/60 flex items-center justify-center border-2 border-cyan-500/40 p-2 shadow-xl">
            <img 
              src={previewUrl || currentLogo || "/assets/images/market_logo_1784884442864.jpg"} 
              alt="Website Logo Preview" 
              className="w-full h-full object-contain"
            />
          </div>
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute -bottom-1 -right-1 p-2 rounded-full bg-cyan-600 text-white shadow-lg hover:bg-cyan-500 transition-all"
            title="Upload Website Logo"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 text-center sm:text-left space-y-2">
          <h4 className="font-semibold text-white text-sm">Website Icon Format & Resolution</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Supported Formats: <span className="text-cyan-300 font-mono font-bold">PNG, JPG, JPEG, WebP</span> (Max file size: <span className="text-cyan-300 font-mono font-bold">5MB</span>). Recommended aspect ratio: 1:1 square icon.
          </p>

          <input 
            ref={fileInputRef}
            type="file" 
            accept="image/*,.png,.jpg,.jpeg,.webp,.svg,.ico,.gif,application/*,*/*" 
            onChange={handleFileChange} 
            className="hidden" 
          />

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={() => fileInputRef.current?.click()}
              className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20 text-xs gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Website Logo (PNG/JPG)
            </Button>

            {currentLogo && (
              <Button 
                type="button" 
                variant="ghost" 
                size="sm" 
                onClick={handleResetDefault}
                className="text-xs text-gray-400 hover:text-rose-300 gap-1"
              >
                <X className="w-3.5 h-3.5" />
                Reset to Default Logo
              </Button>
            )}
          </div>
        </div>
      </div>

      {(selectedFile || previewUrl) && (
        <div className="flex items-center justify-between p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
          <span className="text-xs text-cyan-200">
            Selected File: <strong className="font-mono text-white">{selectedFile?.name || "Cropped PNG/JPG"}</strong>
          </span>
          <Button 
            onClick={handleSaveLogo} 
            disabled={saving} 
            className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs px-4"
          >
            {saving ? "Uploading Logo..." : "Save Website Logo"}
          </Button>
        </div>
      )}

      <ImageCropModal
        isOpen={isCropOpen}
        file={cropFile}
        onClose={() => setIsCropOpen(false)}
        onCropComplete={handleCropComplete}
      />
    </div>
  );
}


export function AdminSettingsAdvanced({ token }: AdminSettingsAdvancedProps) {
  const [activeTab, setActiveTab] = useState('general');

  // General Settings
  const [general, setGeneral] = useState({
    marketplace_name: 'Aurevyxon Digital Asset Security Marketplace',
    support_email: 'support@aurevyxon.com',
    default_currency: 'USD',
    timezone: 'UTC (Coordinated Universal Time)',
    marketplace_status: 'live'
  });

  // Global Base Commission Rate State
  const [globalCommissionRate, setGlobalCommissionRate] = useState<string>("15");
  const [savedRateNotice, setSavedRateNotice] = useState<string>("15");

  // Deterministic Commission Rules Precedence Engine (Defaults to empty; populated from database or user overrides)
  const [commissionRules, setCommissionRules] = useState<any[]>([]);

  // Modal / Editor States for Commission Rules
  const [editingRule, setEditingRule] = useState<any>(null);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);

  // Notification & Email Dispatch Templates State
  const [notificationTemplates, setNotificationTemplates] = useState([
    {
      id: 'tmpl_1',
      title: 'Order Completed & Asset License Dispatch',
      channel: 'Email + In-App',
      enabled: true,
      subject: 'Order #{order_id} Completed - Asset License Key Included',
      body: 'Hello {buyer_name},\n\nThank you for purchasing {product_name} on AureVyxon Marketplace!\n\nOrder ID: #{order_id}\nLicense Key: {license_key}\nDownload URL: {download_url}\n\nBest regards,\nAureVyxon Digital Asset Security',
      variables: ['order_id', 'buyer_name', 'product_name', 'license_key', 'download_url']
    },
    {
      id: 'tmpl_2',
      title: 'Payout Settlement Cleared',
      channel: 'Email + Push',
      enabled: true,
      subject: 'Payout Request #{payout_id} Cleared - ${amount} Dispatched',
      body: 'Hello {seller_name},\n\nYour payout request of ${amount} has been processed and cleared via {payment_method}.\n\nTransaction Reference: {reference_id}\n\nBest regards,\nAureVyxon Treasury Team',
      variables: ['seller_name', 'payout_id', 'amount', 'payment_method', 'reference_id']
    },
    {
      id: 'tmpl_3',
      title: 'Fraud Risk Escalation Warning',
      channel: 'Email Only',
      enabled: true,
      subject: 'URGENT: Security Risk Escalation Warning for Account #{user_id}',
      body: 'Dear {user_name},\n\nOur automated risk system detected unusual activity associated with your account.\n\nRisk Incident: {risk_reason}\nTimestamp: {timestamp}\n\nPlease review your account security immediately by contacting support.',
      variables: ['user_name', 'user_id', 'risk_reason', 'timestamp']
    }
  ]);

  // Modal / Editor States for Notification Templates
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Seller Policies State
  const [sellerRules, setSellerRules] = useState({
    escrow_holding_period: '7',
    minimum_payout_threshold: '$50.00 USD',
    kyc_sla_hours: '72'
  });

  // 7 Multi-Gateway Payment Options State (Unconfigured by default until set in backend database)
  const [payments, setPayments] = useState({
    // 1. Stripe Global
    stripe_enabled: '0',
    stripe_mode: 'production',
    stripe_publishable_key: '',
    stripe_secret_key: '',
    stripe_webhook_secret: '',

    // 2. Razorpay India
    razorpay_enabled: '0',
    razorpay_mode: 'production',
    razorpay_key_id: '',
    razorpay_key_secret: '',
    razorpay_webhook_secret: '',

    // 3. PayPal Commerce
    paypal_enabled: '0',
    paypal_mode: 'live',
    paypal_client_id: '',
    paypal_client_secret: '',
    paypal_merchant_email: '',

    // 4. Direct UPI & Instant QR Code
    upi_enabled: '0',
    upi_vpa: '',
    upi_payee_name: '',
    upi_merchant_id: '',
    upi_verification_token: '',

    // 5. Crypto Web3 Gateway (NOWPayments)
    crypto_gw_enabled: '0',
    crypto_gw_provider: 'NOWPayments',
    crypto_gw_api_key: '',
    crypto_gw_ipn_secret: '',
    crypto_gw_currencies: 'USDT, BTC, ETH, SOL, BNB',

    // 6. Direct Crypto Wallet Deposit
    crypto_direct_enabled: '0',
    crypto_trc20_address: '',
    crypto_erc20_address: '',
    crypto_deposit_notes: '',

    // 7. Direct Bank Wire / NEFT Transfer
    bank_enabled: '0',
    bank_name: '',
    bank_account_name: '',
    bank_account_number: '',
    bank_swift_ifsc: '',
    bank_instructions: ''
  });

  // State to toggle show/hide secret credentials
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const toggleShowSecret = (fieldKey: string) => {
    setShowSecrets(prev => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  };

  // Countries Management State
  const [dbCountries, setDbCountries] = useState<any[]>(ALL_COUNTRIES_DATA);
  const [countrySearch, setCountrySearch] = useState('');
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [newCountry, setNewCountry] = useState({ name: '', iso_code: '', phone_code: '' });
  const [showAddCountry, setShowAddCountry] = useState(false);

  // Sensitive Action Modal & Loading States
  const [sensitiveModalOpen, setSensitiveModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingData, setPendingData] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch persisted settings on mount
  const fetchSettings = async () => {
    try {
      const authToken = token || localStorage.getItem('aurevyxon_token') || '';
      const res = await fetch('/api/admin/settings', {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (data && data.settings) {
        const s = data.settings;
        if (s.marketplace_name) setGeneral(prev => ({ ...prev, marketplace_name: s.marketplace_name }));
        if (s.support_email) setGeneral(prev => ({ ...prev, support_email: s.support_email }));
        if (s.default_currency) setGeneral(prev => ({ ...prev, default_currency: s.default_currency }));
        if (s.timezone) setGeneral(prev => ({ ...prev, timezone: s.timezone }));
        if (s.marketplace_status) setGeneral(prev => ({ ...prev, marketplace_status: s.marketplace_status }));

        if (s.global_commission_rate !== undefined && s.global_commission_rate !== null) {
          setGlobalCommissionRate(String(s.global_commission_rate));
          setSavedRateNotice(String(s.global_commission_rate));
        }

        if (s.escrow_holding_period || s.minimum_payout_threshold || s.kyc_sla_hours) {
          setSellerRules(prev => ({
            ...prev,
            escrow_holding_period: s.escrow_holding_period || prev.escrow_holding_period,
            minimum_payout_threshold: s.minimum_payout_threshold || prev.minimum_payout_threshold,
            kyc_sla_hours: s.kyc_sla_hours || prev.kyc_sla_hours
          }));
        }

        if (s.commission_rules) {
          try {
            const cr = typeof s.commission_rules === 'string' ? JSON.parse(s.commission_rules) : s.commission_rules;
            if (Array.isArray(cr) && cr.length > 0) setCommissionRules(cr);
          } catch (e) {
            console.warn("Failed to parse commission rules:", e);
          }
        }

        if (s.notification_templates) {
          try {
            const nt = typeof s.notification_templates === 'string' ? JSON.parse(s.notification_templates) : s.notification_templates;
            if (Array.isArray(nt) && nt.length > 0) setNotificationTemplates(nt);
          } catch (e) {
            console.warn("Failed to parse notification templates:", e);
          }
        }

        // Populate payment gateways state if stored in platform_settings
        setPayments(prev => {
          const next = { ...prev };
          Object.keys(prev).forEach(k => {
            if (s[k] !== undefined && s[k] !== null) {
              (next as any)[k] = String(s[k]);
            }
          });
          return next;
        });
      }
    } catch (e: any) {
      console.warn("Failed to fetch admin settings:", e);
    }
  };

  React.useEffect(() => {
    fetchSettings();
  }, []);

  const fetchAdminCountries = async () => {
    setCountriesLoading(true);
    try {
      const res = await fetch('/api/admin/countries', {
        headers: { Authorization: `Bearer ${token || localStorage.getItem('aurevyxon_token') || ''}` }
      });
      const data = await res.json();
      if (data && data.success && Array.isArray(data.countries)) {
        const seen = new Set<string>();
        const unique: any[] = [];
        for (const c of data.countries) {
          if (!c) continue;
          const code = (c.iso_code || c.id || '').toUpperCase().trim();
          if (!seen.has(code)) {
            seen.add(code);
            unique.push(c);
          }
        }
        setDbCountries(unique);
      }
    } catch (e: any) {
      console.warn("Failed to fetch admin countries:", e);
    } finally {
      setCountriesLoading(false);
    }
  };

  React.useEffect(() => {
    if (activeTab === 'countries') {
      fetchAdminCountries();
    }
  }, [activeTab]);

  const toggleCountryStatus = async (id: string, currentActive: number) => {
    try {
      const res = await fetch(`/api/admin/countries/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || localStorage.getItem('aurevyxon_token') || ''}`
        },
        body: JSON.stringify({ is_active: currentActive === 1 ? 0 : 1 })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Country status updated!");
        fetchAdminCountries();
      } else {
        toast.error(data.error || "Failed to update country status");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleAddCountrySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCountry.name || !newCountry.iso_code || !newCountry.phone_code) {
      return toast.error("Please fill in Country Name, ISO Code, and Phone Code");
    }
    try {
      const res = await fetch('/api/admin/countries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || localStorage.getItem('aurevyxon_token') || ''}`
        },
        body: JSON.stringify(newCountry)
      });
      const data = await res.json();
      if (data.success) {
        toast.success("New country added successfully!");
        setNewCountry({ name: '', iso_code: '', phone_code: '' });
        setShowAddCountry(false);
        fetchAdminCountries();
      } else {
        toast.error(data.error || "Failed to add country");
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // --- Commission Rules Actions ---
  const moveRuleUp = (index: number) => {
    if (index === 0) return;
    const newRules = [...commissionRules];
    const temp = newRules[index];
    newRules[index] = newRules[index - 1];
    newRules[index - 1] = temp;
    newRules.forEach((r, idx) => { r.precedence = idx + 1; });
    setCommissionRules(newRules);
    toast.success("Rule precedence moved UP.");
  };

  const moveRuleDown = (index: number) => {
    if (index === commissionRules.length - 1) return;
    const newRules = [...commissionRules];
    const temp = newRules[index];
    newRules[index] = newRules[index + 1];
    newRules[index + 1] = temp;
    newRules.forEach((r, idx) => { r.precedence = idx + 1; });
    setCommissionRules(newRules);
    toast.success("Rule precedence moved DOWN.");
  };

  const openAddRuleModal = () => {
    setEditingRule({
      id: `cr_${Date.now()}`,
      level: 'Custom Rule Level',
      target: 'Specific Target Group',
      rate: '15%',
      precedence: commissionRules.length + 1,
      note: 'Custom Override Rule'
    });
    setRuleModalOpen(true);
  };

  const openEditRuleModal = (rule: any) => {
    setEditingRule({ ...rule });
    setRuleModalOpen(true);
  };

  const saveRuleFromModal = () => {
    if (!editingRule.level.trim() || !editingRule.target.trim() || !editingRule.rate.trim()) {
      return toast.error("Please fill in Rule Level, Target, and Rate.");
    }
    const existsIndex = commissionRules.findIndex(r => r.id === editingRule.id);
    let updatedRules: any[];
    if (existsIndex >= 0) {
      updatedRules = [...commissionRules];
      updatedRules[existsIndex] = editingRule;
    } else {
      updatedRules = [...commissionRules, editingRule];
    }
    updatedRules.forEach((r, idx) => { r.precedence = idx + 1; });
    setCommissionRules(updatedRules);
    setRuleModalOpen(false);
    setEditingRule(null);
    toast.success("Commission rule updated!");
  };

  const deleteRule = (ruleId: string) => {
    const updated = commissionRules.filter(r => r.id !== ruleId);
    updated.forEach((r, idx) => { r.precedence = idx + 1; });
    setCommissionRules(updated);
    toast.success("Rule removed from hierarchy.");
  };

  // --- Notification Templates Actions ---
  const toggleTemplateEnabled = (id: string) => {
    const updated = notificationTemplates.map(t => {
      if (t.id === id) {
        const nextState = !t.enabled;
        toast.success(`Template "${t.title}" ${nextState ? 'ENABLED' : 'DISABLED'}`);
        return { ...t, enabled: nextState };
      }
      return t;
    });
    setNotificationTemplates(updated);
  };

  const openEditTemplateModal = (tmpl: any) => {
    setEditingTemplate({ ...tmpl });
    setPreviewMode(false);
    setTemplateModalOpen(true);
  };

  const openAddTemplateModal = () => {
    setEditingTemplate({
      id: `tmpl_${Date.now()}`,
      title: 'New Custom Dispatch Notification',
      channel: 'Email + In-App',
      enabled: true,
      subject: 'Notification from AureVyxon: {subject_topic}',
      body: 'Hello {user_name},\n\nThis is an automated dispatch from AureVyxon.\n\nBest regards,\nAureVyxon Support',
      variables: ['user_name', 'subject_topic']
    });
    setPreviewMode(false);
    setTemplateModalOpen(true);
  };

  const saveTemplateFromModal = () => {
    if (!editingTemplate.title.trim() || !editingTemplate.subject.trim() || !editingTemplate.body.trim()) {
      return toast.error("Title, Subject, and Body content are required.");
    }
    const existsIndex = notificationTemplates.findIndex(t => t.id === editingTemplate.id);
    let updatedTemplates: any[];
    if (existsIndex >= 0) {
      updatedTemplates = [...notificationTemplates];
      updatedTemplates[existsIndex] = editingTemplate;
    } else {
      updatedTemplates = [...notificationTemplates, editingTemplate];
    }
    setNotificationTemplates(updatedTemplates);
    setTemplateModalOpen(false);
    
    // Open sensitive modal to confirm & save to database!
    openSensitiveModal('Notification Email Templates', { notification_templates: JSON.stringify(updatedTemplates) });
  };

  const testDispatchTemplate = (tmpl: any) => {
    let renderedSubject = tmpl.subject || '';
    let renderedBody = tmpl.body || '';
    const sampleVars: Record<string, string> = {
      order_id: '[Sample: {{order_id}}]',
      buyer_name: '[Customer: {{buyer_name}}]',
      product_name: '[Product: {{product_name}}]',
      license_key: '[License: {{license_key}}]',
      download_url: '[Download URL: {{download_url}}]',
      seller_name: '[Seller: {{seller_name}}]',
      payout_id: '[Payout ID: {{payout_id}}]',
      amount: '[Amount: {{amount}}]',
      payment_method: '[Payment Method: {{payment_method}}]',
      reference_id: '[Txn Ref: {{reference_id}}]',
      user_name: '[User: {{user_name}}]',
      user_id: '[User ID: {{user_id}}]',
      risk_reason: '[Risk Trigger: {{risk_reason}}]',
      timestamp: '[Timestamp: {{timestamp}}]'
    };

    Object.keys(sampleVars).forEach(k => {
      renderedSubject = renderedSubject.replaceAll(`{${k}}`, sampleVars[k]);
      renderedBody = renderedBody.replaceAll(`{${k}}`, sampleVars[k]);
    });

    toast.success(`[TEST DISPATCH PREVIEW] ${tmpl.channel}: "${renderedSubject}"`, {
      description: renderedBody.substring(0, 100) + "..."
    });
  };

  const deleteTemplate = (tmplId: string) => {
    const updated = notificationTemplates.filter(t => t.id !== tmplId);
    setNotificationTemplates(updated);
    openSensitiveModal('Delete Notification Template', { notification_templates: JSON.stringify(updated) });
  };

  // Direct Non-Sensitive Setting Save
  const handleDirectSave = async (sectionName: string, payloadData: any) => {
    setSubmitting(true);
    try {
      const authToken = token || localStorage.getItem('aurevyxon_token') || '';
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          settings: payloadData,
          section: sectionName
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`${sectionName} saved successfully!`);
      } else {
        toast.error(data.error || "Failed to save settings");
      }
    } catch (e: any) {
      toast.error("Network error: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveGlobalCommission = async (rateToSave?: string) => {
    const val = rateToSave || globalCommissionRate;
    if (!val || isNaN(Number(val)) || Number(val) < 0 || Number(val) > 100) {
      return toast.error("Please enter a valid percentage between 0 and 100");
    }
    setSubmitting(true);
    try {
      const authToken = token || localStorage.getItem('aurevyxon_token') || '';
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          settings: { global_commission_rate: val },
          reason: `Updated Global Base Commission Rate to ${val}%`,
          section: 'Global Commission Rate'
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSavedRateNotice(val);
        setGlobalCommissionRate(val);
        toast.success(`Global Commission Rate saved as ${val}%! Active for all customer checkouts.`);
      } else {
        toast.error(data.error || "Failed to save commission rate");
      }
    } catch (e: any) {
      toast.error("Network error: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Trigger Sensitive Modal
  const openSensitiveModal = (sectionName: string, payloadData: any) => {
    setPendingAction(sectionName);
    setPendingData(payloadData);
    setReason("");
    setSensitiveModalOpen(true);
  };

  // Confirm Sensitive Change with Real Backend Execution + Audit Logging
  const confirmSensitiveChange = async () => {
    if (!reason.trim()) {
      return toast.error("Audit reason is required for sensitive configuration changes!");
    }

    setSubmitting(true);
    try {
      const authToken = token || localStorage.getItem('aurevyxon_token') || '';
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          settings: pendingData || {},
          reason: reason.trim(),
          section: pendingAction
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Sensitive update for ${pendingAction} applied & logged to Immutable Audit Trail!`);
        setSensitiveModalOpen(false);
        setReason("");
        setPendingAction(null);
        setPendingData(null);
        fetchSettings();
      } else {
        toast.error(data.error || "Failed to save sensitive configuration");
      }
    } catch (e: any) {
      toast.error("Network error: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-[#141428]/80 backdrop-blur-xl border border-border rounded-xl p-6 shadow-2xl font-sans text-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" /> Platform System Settings & Deterministic Engine
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Marketplace configuration, deterministic commission engine, encrypted payments & notification rules</p>
        </div>
      </div>

      {/* Navigation Subtabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none border-b border-white/10">
        {[
          { id: 'general', label: 'General Identity' },
          { id: 'admin_profile', label: 'Admin Profile & Avatar' },
          { id: 'countries', label: 'Countries & Phone Codes (240+)' },
          { id: 'commission', label: 'Deterministic Commission Rules' },
          { id: 'seller_rules', label: 'Seller & Payout Policies' },
          { id: 'payments', label: 'Payment Credentials & Gateway' },
          { id: 'notifications', label: 'Notification Templates' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg font-mono text-xs uppercase tracking-wider flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                : 'text-muted-foreground hover:bg-white/5 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Subtab: Admin Profile & Avatar */}
      {activeTab === 'admin_profile' && (
        <AdminProfileSection token={token} />
      )}

      {/* Tab 1: General Identity */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <WebsiteLogoSection token={token} />

          <div className="bg-[#101020] border border-border/50 rounded-xl p-6 space-y-6">
            <h3 className="font-bold text-white text-base">Marketplace Identity & Global Parameters</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-mono text-muted-foreground block mb-1">Marketplace Title</label>
                <input
                  type="text"
                  value={general.marketplace_name}
                  onChange={(e) => setGeneral({ ...general, marketplace_name: e.target.value })}
                  className="w-full bg-[#141428] border border-border rounded p-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-mono text-muted-foreground block mb-1">Support & Escalation Email</label>
                <input
                  type="text"
                  value={general.support_email}
                  onChange={(e) => setGeneral({ ...general, support_email: e.target.value })}
                  className="w-full bg-[#141428] border border-border rounded p-2 text-xs text-white"
                />
              </div>
            </div>
            <Button 
              disabled={submitting}
              onClick={() => handleDirectSave('General Settings', general)} 
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              Save General Settings
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'countries' && (
        <div className="bg-[#101020] border border-border/50 rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-400" /> Dynamic Country & Dial Code Database Management
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Manage global signup and KYC countries. Enable or disable countries, update phone codes, or insert new region entries.
              </p>
            </div>
            <Button
              onClick={() => setShowAddCountry(!showAddCountry)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
            >
              {showAddCountry ? "Cancel Add" : "+ Add New Country"}
            </Button>
          </div>

          {/* Add Country Form */}
          {showAddCountry && (
            <form onSubmit={handleAddCountrySubmit} className="p-4 bg-slate-900/90 border border-indigo-500/30 rounded-xl space-y-3 animate-in fade-in">
              <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Add Custom Country Entry</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-mono">Country Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Monaco"
                    value={newCountry.name}
                    onChange={(e) => setNewCountry({ ...newCountry, name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-mono">ISO Code (2-letter) *</label>
                  <input
                    type="text"
                    placeholder="e.g. MC"
                    maxLength={2}
                    value={newCountry.iso_code}
                    onChange={(e) => setNewCountry({ ...newCountry, iso_code: e.target.value.toUpperCase() })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1 font-mono">Phone Code (+XX) *</label>
                  <input
                    type="text"
                    placeholder="e.g. +377"
                    value={newCountry.phone_code}
                    onChange={(e) => setNewCountry({ ...newCountry, phone_code: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-white font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs">
                  Save Country to Database
                </Button>
              </div>
            </form>
          )}

          {/* Search Bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search country by name, ISO code (e.g. IN), or phone code (+91)..."
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-3 pr-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Total Countries: <span className="text-indigo-400 font-bold">{dbCountries.length}</span>
            </div>
          </div>

          {/* Countries Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden max-h-[450px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-mono border-b border-slate-800 sticky top-0 z-10">
                <tr>
                  <th className="p-3">ISO</th>
                  <th className="p-3">Country Name</th>
                  <th className="p-3">Phone Dial Code</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Admin Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/30">
                {countriesLoading ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">Loading country database...</td>
                  </tr>
                ) : dbCountries.filter(c => 
                    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
                    c.iso_code.toLowerCase().includes(countrySearch.toLowerCase()) ||
                    c.phone_code.toLowerCase().includes(countrySearch.toLowerCase())
                  ).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">No countries match "{countrySearch}"</td>
                  </tr>
                ) : (
                  dbCountries
                    .filter(c => 
                      c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
                      c.iso_code.toLowerCase().includes(countrySearch.toLowerCase()) ||
                      c.phone_code.toLowerCase().includes(countrySearch.toLowerCase())
                    )
                    .map((country, idx) => (
                      <tr key={country.id ? `country-${country.id}` : `country-${country.iso_code}-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-3 font-mono font-bold text-indigo-300">{country.iso_code}</td>
                        <td className="p-3 font-semibold text-slate-100">{country.name}</td>
                        <td className="p-3 font-mono text-emerald-400">{country.phone_code}</td>
                        <td className="p-3">
                          {country.is_active === 1 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                              Disabled
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => toggleCountryStatus(country.id, country.is_active)}
                            className={`px-3 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                              country.is_active === 1
                                ? 'bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/30'
                                : 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/30'
                            }`}
                          >
                            {country.is_active === 1 ? "Disable" : "Enable"}
                          </button>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Deterministic Commission Engine */}
      {activeTab === 'commission' && (
        <div className="space-y-6">
          {/* Prominent Global Base Commission Rate Control & Saved Display Card */}
          <div className="bg-gradient-to-r from-indigo-950/90 via-[#12122b] to-slate-900 border border-indigo-500/40 rounded-xl p-6 shadow-2xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-indigo-500/20 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <Calculator className="w-6 h-6 text-emerald-400" />
                  <h3 className="font-bold text-white text-lg tracking-wide">Global Platform Commission Rate Settings</h3>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  Select and save the commission percentage. Saved rate is enforced directly on all live customer payments.
                </p>
              </div>

              {/* Prominent Saved Rate Display Badge */}
              <div className="bg-emerald-950/80 border border-emerald-500/50 rounded-xl px-5 py-2.5 flex items-center gap-3 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_12px_#10b981]" />
                <div>
                  <div className="text-[10px] text-emerald-300 font-extrabold uppercase tracking-wider">Active Saved Commission</div>
                  <div className="text-2xl font-black text-emerald-400 font-mono tracking-tight">{savedRateNotice}% DEDUCTION</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-end pt-2">
              <div className="lg:col-span-2 space-y-3">
                <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  Select or Enter Commission Percentage (%)
                </label>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative w-44">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={globalCommissionRate}
                      onChange={(e) => setGlobalCommissionRate(e.target.value)}
                      className="w-full bg-black/70 border border-indigo-500/60 rounded-xl px-4 py-3 text-white font-mono font-black text-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-9"
                      placeholder="15"
                    />
                    <span className="absolute right-3.5 top-3.5 text-slate-400 font-black text-base">%</span>
                  </div>

                  {/* Preset Buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {["5", "10", "15", "20", "25"].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setGlobalCommissionRate(p);
                          handleSaveGlobalCommission(p);
                        }}
                        className={`px-3.5 py-2.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                          globalCommissionRate === p
                            ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)] scale-105"
                            : "bg-slate-900/80 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white"
                        }`}
                      >
                        {p}%
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-slate-300">
                  <span className="text-emerald-400 font-bold">Live Transparent Guarantee:</span> When buyers click to make a payment, they will see a full price breakdown showing <span className="text-emerald-300 font-black">{globalCommissionRate}%</span> commission deducted for marketplace escrow & processing.
                </p>
              </div>

              <div>
                <Button
                  onClick={() => handleSaveGlobalCommission()}
                  disabled={submitting}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold h-13 text-sm shadow-[0_0_20px_rgba(16,185,129,0.4)] flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95"
                >
                  <Save className="w-4 h-4" /> Save Commission Percentage
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-[#101020] border border-border/50 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-indigo-400" /> Deterministic Commission Precedence Hierarchy
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {commissionRules.length > 0
                    ? `Order of evaluation: ${commissionRules.map(r => r.level).join(" → ")}`
                    : `Base platform commission rate (${globalCommissionRate}%) is currently active across all categories.`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={openAddRuleModal} 
                  className="border-indigo-500/40 text-indigo-300 hover:bg-indigo-950/50 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Precedence Override
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => openSensitiveModal('Commission Engine Hierarchy & Rates', { commission_rules: JSON.stringify(commissionRules) })} 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Update Commission Hierarchy
                </Button>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {commissionRules.length === 0 ? (
                <div className="p-6 bg-black/40 border border-white/10 rounded-xl text-center text-xs text-muted-foreground font-mono">
                  No custom commission rules configured — Base platform rate ({globalCommissionRate}%) applies globally. Click "+ Add Precedence Override" to create category or seller tier overrides.
                </div>
              ) : (
                commissionRules.map((cr, idx) => (
                <div key={cr.id} className="p-4 bg-black/40 border border-white/10 rounded-xl flex flex-wrap items-center justify-between gap-4 transition-all hover:border-indigo-500/30">
                  <div className="flex items-center gap-3 min-w-[240px]">
                    <div className="flex flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveRuleUp(idx)}
                        disabled={idx === 0}
                        title="Move Up Precedence"
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 font-mono text-xs flex items-center justify-center font-bold border border-indigo-500/30">
                        {cr.precedence}
                      </span>
                      <button
                        type="button"
                        onClick={() => moveRuleDown(idx)}
                        disabled={idx === commissionRules.length - 1}
                        title="Move Down Precedence"
                        className="p-1 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div>
                      <div className="font-bold text-white text-sm flex items-center gap-2">
                        {cr.level}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Target: <span className="text-indigo-200 font-medium">{cr.target}</span> <span className="text-slate-500">({cr.note})</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-slate-400">Rate:</span>
                      <input 
                        type="text"
                        value={cr.rate}
                        onChange={(e) => {
                          const updated = [...commissionRules];
                          updated[idx].rate = e.target.value;
                          setCommissionRules(updated);
                        }}
                        className="w-16 bg-transparent text-emerald-400 font-mono font-bold text-sm text-right focus:outline-none focus:ring-1 focus:ring-emerald-500/50 rounded"
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditRuleModal(cr)}
                        className="h-8 w-8 p-0 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                        title="Edit Details"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteRule(cr.id)}
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-950/40 cursor-pointer"
                        title="Delete Override"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Seller & Payout Rules */}
      {activeTab === 'seller_rules' && (
        <div className="bg-[#101020] border border-border/50 rounded-xl p-6 space-y-4">
          <h3 className="font-bold text-white text-base">Seller Qualification & Review SLA Policies</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-black/30 border border-white/10 rounded-xl space-y-2">
              <div className="font-bold text-white text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" /> KYC Review SLA Duration
              </div>
              <p className="text-xs text-muted-foreground">Maximum SLA review time shown to seller before status badge freezes.</p>
              <select 
                value={sellerRules.kyc_sla_hours}
                onChange={(e) => setSellerRules({ ...sellerRules, kyc_sla_hours: e.target.value })}
                className="w-full bg-[#141428] border border-border rounded p-2 text-xs text-white"
              >
                <option value="48">48 Hours (Fast Track)</option>
                <option value="72">72 Hours (Standard Default)</option>
                <option value="96">96 Hours (4 Days)</option>
                <option value="120">120 Hours (5 Days)</option>
              </select>
            </div>

            <div className="p-4 bg-black/30 border border-white/10 rounded-xl space-y-2">
              <div className="font-bold text-white text-sm">Escrow Holding Period</div>
              <p className="text-xs text-muted-foreground">Days funds remain in escrow before release to seller balance.</p>
              <select 
                value={sellerRules.escrow_holding_period}
                onChange={(e) => setSellerRules({ ...sellerRules, escrow_holding_period: e.target.value })}
                className="w-full bg-[#141428] border border-border rounded p-2 text-xs text-white"
              >
                <option value="7">7 Days (Standard Buyer Protection)</option>
                <option value="14">14 Days (Extended Risk Hold)</option>
                <option value="0">Instant (Trusted Institutional Sellers)</option>
              </select>
            </div>

            <div className="p-4 bg-black/30 border border-white/10 rounded-xl space-y-2">
              <div className="font-bold text-white text-sm">Minimum Payout Threshold</div>
              <p className="text-xs text-muted-foreground">Minimum accrued earnings required for payout request.</p>
              <input
                type="text"
                value={sellerRules.minimum_payout_threshold}
                onChange={(e) => setSellerRules({ ...sellerRules, minimum_payout_threshold: e.target.value })}
                className="w-full bg-[#141428] border border-border rounded p-2 text-xs text-white"
              />
            </div>
          </div>
          <Button 
            onClick={() => openSensitiveModal('Seller & SLA Policies', sellerRules)} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
          >
            Save Seller Rules
          </Button>
        </div>
      )}

      {/* Tab 4: Multi-Gateway Payment Credentials & Options */}
      {activeTab === 'payments' && (
        <div className="bg-[#101020] border border-border/50 rounded-xl p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="font-bold text-white text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-400" /> Multi-Gateway & Receiving Payment Options (7 Methods)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Configure, enable/disable, and edit API credentials, UPI VPAs, Web3 API keys, Crypto wallet addresses, and Bank accounts. All sensitive credential changes require audit reason logging.
              </p>
            </div>
            <Button 
              onClick={() => openSensitiveModal('Payment Gateways & Receiving Methods Configuration', payments)} 
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2.5 shadow-lg flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <Save className="w-4 h-4" /> Save All 7 Payment Options
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* 1. Stripe Global Payments */}
            <div className={`p-5 rounded-2xl border transition-all ${payments.stripe_enabled === '1' ? 'bg-slate-900/60 border-indigo-500/40 shadow-[0_0_20px_rgba(99,102,241,0.08)]' : 'bg-slate-950/40 border-slate-800 opacity-75'}`}>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">1. Stripe Global Payments</h4>
                    <span className="text-[10px] text-slate-400">Cards, Apple Pay, Google Pay, iDEAL</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={payments.stripe_mode}
                    onChange={(e) => setPayments({ ...payments, stripe_mode: e.target.value })}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-indigo-300"
                  >
                    <option value="production">Live / Production</option>
                    <option value="test">Test / Sandbox</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setPayments({ ...payments, stripe_enabled: payments.stripe_enabled === '1' ? '0' : '1' })}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono transition-all cursor-pointer ${
                      payments.stripe_enabled === '1'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-red-500/20 text-red-400 border border-red-500/40'
                    }`}
                  >
                    {payments.stripe_enabled === '1' ? '● ENABLED' : '○ DISABLED'}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Publishable Key</label>
                  <input
                    type="text"
                    value={payments.stripe_publishable_key}
                    onChange={(e) => setPayments({ ...payments, stripe_publishable_key: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Secret Key (Encrypted)</label>
                  <div className="relative">
                    <input
                      type={showSecrets['stripe_secret_key'] ? 'text' : 'password'}
                      value={payments.stripe_secret_key}
                      onChange={(e) => setPayments({ ...payments, stripe_secret_key: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 pr-10 text-xs font-mono text-emerald-400"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowSecret('stripe_secret_key')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                    >
                      {showSecrets['stripe_secret_key'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Webhook Signing Secret</label>
                  <div className="relative">
                    <input
                      type={showSecrets['stripe_webhook_secret'] ? 'text' : 'password'}
                      value={payments.stripe_webhook_secret}
                      onChange={(e) => setPayments({ ...payments, stripe_webhook_secret: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 pr-10 text-xs font-mono text-indigo-300"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowSecret('stripe_webhook_secret')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                    >
                      {showSecrets['stripe_webhook_secret'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Razorpay India Gateway */}
            <div className={`p-5 rounded-2xl border transition-all ${payments.razorpay_enabled === '1' ? 'bg-slate-900/60 border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.08)]' : 'bg-slate-950/40 border-slate-800 opacity-75'}`}>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">2. Razorpay Gateway (India / Asia)</h4>
                    <span className="text-[10px] text-slate-400">UPI, NetBanking, Debit & Credit Cards</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={payments.razorpay_mode}
                    onChange={(e) => setPayments({ ...payments, razorpay_mode: e.target.value })}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-blue-300"
                  >
                    <option value="production">Production</option>
                    <option value="test">Test Mode</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setPayments({ ...payments, razorpay_enabled: payments.razorpay_enabled === '1' ? '0' : '1' })}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono transition-all cursor-pointer ${
                      payments.razorpay_enabled === '1'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-red-500/20 text-red-400 border border-red-500/40'
                    }`}
                  >
                    {payments.razorpay_enabled === '1' ? '● ENABLED' : '○ DISABLED'}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Razorpay Key ID</label>
                  <input
                    type="text"
                    value={payments.razorpay_key_id}
                    onChange={(e) => setPayments({ ...payments, razorpay_key_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-blue-300"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Razorpay Key Secret</label>
                  <div className="relative">
                    <input
                      type={showSecrets['razorpay_key_secret'] ? 'text' : 'password'}
                      value={payments.razorpay_key_secret}
                      onChange={(e) => setPayments({ ...payments, razorpay_key_secret: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 pr-10 text-xs font-mono text-emerald-400"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowSecret('razorpay_key_secret')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                    >
                      {showSecrets['razorpay_key_secret'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Webhook Secret</label>
                  <input
                    type="text"
                    value={payments.razorpay_webhook_secret}
                    onChange={(e) => setPayments({ ...payments, razorpay_webhook_secret: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-slate-300"
                  />
                </div>
              </div>
            </div>

            {/* 3. PayPal Commerce Platform */}
            <div className={`p-5 rounded-2xl border transition-all ${payments.paypal_enabled === '1' ? 'bg-slate-900/60 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.08)]' : 'bg-slate-950/40 border-slate-800 opacity-75'}`}>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">3. PayPal Commerce Platform</h4>
                    <span className="text-[10px] text-slate-400">Global PayPal, Pay in 4, Credit Cards</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={payments.paypal_mode}
                    onChange={(e) => setPayments({ ...payments, paypal_mode: e.target.value })}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-amber-300"
                  >
                    <option value="live">Live</option>
                    <option value="sandbox">Sandbox</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setPayments({ ...payments, paypal_enabled: payments.paypal_enabled === '1' ? '0' : '1' })}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono transition-all cursor-pointer ${
                      payments.paypal_enabled === '1'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-red-500/20 text-red-400 border border-red-500/40'
                    }`}
                  >
                    {payments.paypal_enabled === '1' ? '● ENABLED' : '○ DISABLED'}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">PayPal Client ID</label>
                  <input
                    type="text"
                    value={payments.paypal_client_id}
                    onChange={(e) => setPayments({ ...payments, paypal_client_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-amber-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">PayPal Client Secret</label>
                  <div className="relative">
                    <input
                      type={showSecrets['paypal_client_secret'] ? 'text' : 'password'}
                      value={payments.paypal_client_secret}
                      onChange={(e) => setPayments({ ...payments, paypal_client_secret: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 pr-10 text-xs font-mono text-emerald-400"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowSecret('paypal_client_secret')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                    >
                      {showSecrets['paypal_client_secret'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Merchant Account Email</label>
                  <input
                    type="email"
                    value={payments.paypal_merchant_email}
                    onChange={(e) => setPayments({ ...payments, paypal_merchant_email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* 4. Direct UPI & Instant QR Code */}
            <div className={`p-5 rounded-2xl border transition-all ${payments.upi_enabled === '1' ? 'bg-slate-900/60 border-teal-500/40 shadow-[0_0_20px_rgba(20,184,166,0.08)]' : 'bg-slate-950/40 border-slate-800 opacity-75'}`}>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">4. Direct UPI VPA & Instant QR Code</h4>
                    <span className="text-[10px] text-slate-400">PhonePe, Google Pay, Paytm, BHIM Direct QR</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPayments({ ...payments, upi_enabled: payments.upi_enabled === '1' ? '0' : '1' })}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono transition-all cursor-pointer ${
                    payments.upi_enabled === '1'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-red-500/20 text-red-400 border border-red-500/40'
                  }`}
                >
                  {payments.upi_enabled === '1' ? '● ENABLED' : '○ DISABLED'}
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Merchant UPI VPA (ID)</label>
                    <input
                      type="text"
                      value={payments.upi_vpa}
                      onChange={(e) => setPayments({ ...payments, upi_vpa: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-teal-300 font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Payee Display Name</label>
                    <input
                      type="text"
                      value={payments.upi_payee_name}
                      onChange={(e) => setPayments({ ...payments, upi_payee_name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Merchant Code</label>
                    <input
                      type="text"
                      value={payments.upi_merchant_id}
                      onChange={(e) => setPayments({ ...payments, upi_merchant_id: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-slate-300"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Verification Secret Salt</label>
                    <input
                      type="password"
                      value={payments.upi_verification_token}
                      onChange={(e) => setPayments({ ...payments, upi_verification_token: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-teal-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Crypto Web3 Gateway */}
            <div className={`p-5 rounded-2xl border transition-all ${payments.crypto_gw_enabled === '1' ? 'bg-slate-900/60 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.08)]' : 'bg-slate-950/40 border-slate-800 opacity-75'}`}>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
                    <Coins className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">5. Crypto Web3 Gateway (NOWPayments)</h4>
                    <span className="text-[10px] text-slate-400">Automated Web3 Checkout & IPN Settlement</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPayments({ ...payments, crypto_gw_enabled: payments.crypto_gw_enabled === '1' ? '0' : '1' })}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono transition-all cursor-pointer ${
                    payments.crypto_gw_enabled === '1'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-red-500/20 text-red-400 border border-red-500/40'
                  }`}
                >
                  {payments.crypto_gw_enabled === '1' ? '● ENABLED' : '○ DISABLED'}
                </button>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Gateway Provider</label>
                    <select
                      value={payments.crypto_gw_provider}
                      onChange={(e) => setPayments({ ...payments, crypto_gw_provider: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-purple-300"
                    >
                      <option value="NOWPayments">NOWPayments API</option>
                      <option value="Coinbase Commerce">Coinbase Commerce</option>
                      <option value="BTCPay Server">BTCPay Server</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Supported Coins</label>
                    <input
                      type="text"
                      value={payments.crypto_gw_currencies}
                      onChange={(e) => setPayments({ ...payments, crypto_gw_currencies: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-slate-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Gateway API Key</label>
                  <div className="relative">
                    <input
                      type={showSecrets['crypto_gw_api_key'] ? 'text' : 'password'}
                      value={payments.crypto_gw_api_key}
                      onChange={(e) => setPayments({ ...payments, crypto_gw_api_key: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 pr-10 text-xs font-mono text-purple-300"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowSecret('crypto_gw_api_key')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                    >
                      {showSecrets['crypto_gw_api_key'] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">IPN Callback Secret Key</label>
                  <input
                    type="password"
                    value={payments.crypto_gw_ipn_secret}
                    onChange={(e) => setPayments({ ...payments, crypto_gw_ipn_secret: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-emerald-400"
                  />
                </div>
              </div>
            </div>

            {/* 6. Direct Crypto Wallet Deposit */}
            <div className={`p-5 rounded-2xl border transition-all ${payments.crypto_direct_enabled === '1' ? 'bg-slate-900/60 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.08)]' : 'bg-slate-950/40 border-slate-800 opacity-75'}`}>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">6. Direct Crypto Wallet Deposits</h4>
                    <span className="text-[10px] text-slate-400">USDT TRC20 & ERC20 Direct Transfer</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPayments({ ...payments, crypto_direct_enabled: payments.crypto_direct_enabled === '1' ? '0' : '1' })}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono transition-all cursor-pointer ${
                    payments.crypto_direct_enabled === '1'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-red-500/20 text-red-400 border border-red-500/40'
                  }`}
                >
                  {payments.crypto_direct_enabled === '1' ? '● ENABLED' : '○ DISABLED'}
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">USDT TRC20 Deposit Wallet Address</label>
                  <input
                    type="text"
                    value={payments.crypto_trc20_address}
                    onChange={(e) => setPayments({ ...payments, crypto_trc20_address: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-emerald-300 font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">USDT ERC20 / BEP20 Wallet Address</label>
                  <input
                    type="text"
                    value={payments.crypto_erc20_address}
                    onChange={(e) => setPayments({ ...payments, crypto_erc20_address: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-indigo-300 font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Deposit Memo / Buyer Instructions</label>
                  <textarea
                    rows={2}
                    value={payments.crypto_deposit_notes}
                    onChange={(e) => setPayments({ ...payments, crypto_deposit_notes: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-300"
                  />
                </div>
              </div>
            </div>

            {/* 7. Direct Bank Wire & NEFT Settlement */}
            <div className={`p-5 rounded-2xl border transition-all lg:col-span-2 ${payments.bank_enabled === '1' ? 'bg-slate-900/60 border-cyan-500/40 shadow-[0_0_20px_rgba(6,182,212,0.08)]' : 'bg-slate-950/40 border-slate-800 opacity-75'}`}>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">7. Direct Bank Wire, NEFT & SEPA Transfer</h4>
                    <span className="text-[10px] text-slate-400">Bank-to-bank electronic wire transfer settlement</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPayments({ ...payments, bank_enabled: payments.bank_enabled === '1' ? '0' : '1' })}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono transition-all cursor-pointer ${
                    payments.bank_enabled === '1'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-red-500/20 text-red-400 border border-red-500/40'
                  }`}
                >
                  {payments.bank_enabled === '1' ? '● ENABLED' : '○ DISABLED'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={payments.bank_name}
                    onChange={(e) => setPayments({ ...payments, bank_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Account Holder Name</label>
                  <input
                    type="text"
                    value={payments.bank_account_name}
                    onChange={(e) => setPayments({ ...payments, bank_account_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-semibold"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Account Number / IBAN</label>
                  <input
                    type="text"
                    value={payments.bank_account_number}
                    onChange={(e) => setPayments({ ...payments, bank_account_number: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-cyan-300 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">SWIFT / BIC / IFSC Code</label>
                  <input
                    type="text"
                    value={payments.bank_swift_ifsc}
                    onChange={(e) => setPayments({ ...payments, bank_swift_ifsc: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs font-mono text-indigo-300 font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">Wire Transfer Instructions for Buyers</label>
                  <input
                    type="text"
                    value={payments.bank_instructions}
                    onChange={(e) => setPayments({ ...payments, bank_instructions: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-300"
                  />
                </div>
              </div>
            </div>

          </div>

          <div className="pt-2 flex justify-end">
            <Button 
              onClick={() => openSensitiveModal('Payment Gateways & Receiving Methods Configuration', payments)} 
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-6 py-2.5 shadow-lg flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" /> Confirm & Save All 7 Gateways
            </Button>
          </div>
        </div>
      )}

      {/* Tab 5: Notification Templates */}
      {activeTab === 'notifications' && (
        <div className="bg-[#101020] border border-border/50 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Bell className="w-5 h-5 text-indigo-400" /> Notification & Email Dispatch Templates
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Manage automated system emails, push alerts, and in-app dispatches
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={openAddTemplateModal}
                className="border-indigo-500/40 text-indigo-300 hover:bg-indigo-950/50 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> New Dispatch Template
              </Button>
              <Button
                size="sm"
                onClick={() => openSensitiveModal('Notification Email Templates', { notification_templates: JSON.stringify(notificationTemplates) })}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" /> Save All Templates
              </Button>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            {notificationTemplates.map((tmpl) => (
              <div key={tmpl.id} className="p-4 bg-black/40 border border-white/10 rounded-xl flex flex-wrap items-center justify-between gap-4 transition-all hover:border-indigo-500/30">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-white text-sm">{tmpl.title}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      tmpl.enabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {tmpl.enabled ? 'ACTIVE' : 'DISABLED'}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3">
                    <span>Channel: <strong className="text-slate-200">{tmpl.channel}</strong></span>
                    <span>•</span>
                    <span className="truncate max-w-xs text-slate-400">Subject: "{tmpl.subject}"</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleTemplateEnabled(tmpl.id)}
                    className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-colors ${
                      tmpl.enabled ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-indigo-950 text-indigo-300 hover:bg-indigo-900'
                    }`}
                  >
                    {tmpl.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testDispatchTemplate(tmpl)}
                    className="text-xs border-indigo-500/30 text-indigo-300 hover:bg-indigo-950/50 flex items-center gap-1 cursor-pointer"
                    title="Send Test Dispatch"
                  >
                    <Send className="w-3 h-3" /> Test
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => openEditTemplateModal(tmpl)}
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" /> Edit Template
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteTemplate(tmpl.id)}
                    className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-950/40 cursor-pointer"
                    title="Delete Template"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commission Rule Precedence Modal */}
      {ruleModalOpen && editingRule && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#121226] border border-indigo-500/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl text-left">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Calculator className="w-5 h-5 text-indigo-400" /> Commission Precedence Override
              </h3>
              <button 
                onClick={() => { setRuleModalOpen(false); setEditingRule(null); }}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-bold block mb-1">Precedence Level Name</label>
                <input
                  type="text"
                  placeholder="e.g., Promotional Override, Category Standard"
                  value={editingRule.level}
                  onChange={(e) => setEditingRule({ ...editingRule, level: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Target Criteria</label>
                <input
                  type="text"
                  placeholder="e.g., Summer Sale Category, UI/UX Kits Category"
                  value={editingRule.target}
                  onChange={(e) => setEditingRule({ ...editingRule, target: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Commission Rate (%)</label>
                <input
                  type="text"
                  placeholder="e.g., 10%, 15%, 20%"
                  value={editingRule.rate}
                  onChange={(e) => setEditingRule({ ...editingRule, rate: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white font-mono text-emerald-400 font-bold"
                />
              </div>

              <div>
                <label className="text-slate-300 font-bold block mb-1">Rule Note / Evaluation Priority</label>
                <input
                  type="text"
                  placeholder="e.g., Highest Precedence, Seller Specific"
                  value={editingRule.note}
                  onChange={(e) => setEditingRule({ ...editingRule, note: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => { setRuleModalOpen(false); setEditingRule(null); }}
                className="text-xs border-slate-700 text-slate-300 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={saveRuleFromModal}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 cursor-pointer"
              >
                Apply Rule
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Template Editor Modal */}
      {templateModalOpen && editingTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#121226] border border-indigo-500/40 rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl text-left max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Bell className="w-5 h-5 text-indigo-400" /> Template Editor: {editingTemplate.title}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Customize template subject, variables, and body content</p>
              </div>
              <button 
                onClick={() => { setTemplateModalOpen(false); setEditingTemplate(null); }}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs for Editor vs Rendered Preview */}
            <div className="flex items-center justify-between bg-slate-900 p-1.5 rounded-xl border border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewMode(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !previewMode ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5 inline mr-1.5" /> Edit Template
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    previewMode ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <EyeIcon className="w-3.5 h-3.5 inline mr-1.5" /> Rendered Preview
                </button>
              </div>

              <div className="flex items-center gap-2 pr-2">
                <span className="text-xs text-slate-400">Active Status:</span>
                <button
                  type="button"
                  onClick={() => setEditingTemplate({ ...editingTemplate, enabled: !editingTemplate.enabled })}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                    editingTemplate.enabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {editingTemplate.enabled ? 'ACTIVE' : 'DISABLED'}
                </button>
              </div>
            </div>

            {!previewMode ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 font-bold block mb-1">Template Title</label>
                    <input
                      type="text"
                      value={editingTemplate.title}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, title: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 font-bold block mb-1">Dispatch Channels</label>
                    <select
                      value={editingTemplate.channel}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, channel: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white"
                    >
                      <option value="Email + In-App">Email + In-App</option>
                      <option value="Email + Push">Email + Push</option>
                      <option value="Email Only">Email Only</option>
                      <option value="In-App + Push">In-App + Push</option>
                      <option value="SMS + Email">SMS + Email</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-slate-300 font-bold block mb-1">Email Subject Line</label>
                  <input
                    type="text"
                    value={editingTemplate.subject}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-lg p-2.5 text-xs text-white font-mono"
                  />
                </div>

                {/* Variable Tags Bar */}
                <div>
                  <label className="text-slate-400 text-[11px] font-bold block mb-1">Available Placeholder Variables (Click to insert):</label>
                  <div className="flex flex-wrap gap-1.5 p-2 bg-slate-950 rounded-lg border border-slate-800">
                    {(editingTemplate.variables || ['user_name', 'order_id', 'amount', 'product_name', 'license_key', 'download_url']).map((v: string) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setEditingTemplate({
                            ...editingTemplate,
                            body: editingTemplate.body + ` {${v}}`
                          });
                        }}
                        className="px-2 py-1 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/30 text-indigo-300 rounded font-mono text-[10px] cursor-pointer flex items-center gap-1"
                      >
                        <Code className="w-2.5 h-2.5" /> `{`{${v}}`}`
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-slate-300 font-bold block mb-1">Template Content Body</label>
                  <textarea
                    rows={8}
                    value={editingTemplate.body}
                    onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-lg p-3 text-xs text-white font-mono leading-relaxed"
                  />
                </div>
              </div>
            ) : (
              /* Rendered Preview Mode */
              <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="text-xs text-slate-400 border-b border-slate-800 pb-2 space-y-1">
                  <div><strong className="text-slate-200">To:</strong> customer@example.com</div>
                  <div><strong className="text-slate-200">Channel:</strong> {editingTemplate.channel}</div>
                  <div><strong className="text-slate-200">Subject:</strong> {editingTemplate.subject}</div>
                </div>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 text-xs font-sans whitespace-pre-wrap leading-relaxed text-slate-200">
                  {editingTemplate.body}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => testDispatchTemplate(editingTemplate)}
                className="text-xs border-slate-700 text-indigo-300 hover:bg-indigo-950/50 flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" /> Send Test Email
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setTemplateModalOpen(false); setEditingTemplate(null); }}
                  className="text-xs border-slate-700 text-slate-300 cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveTemplateFromModal}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Save Template
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Centered High-Contrast Sensitive Action Modal Overlay */}
      {sensitiveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#121226] border border-amber-500/60 rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-[0_0_50px_rgba(245,158,11,0.2)] text-left">
            
            {/* Header */}
            <div className="flex items-center gap-3 text-amber-400 font-bold text-lg border-b border-amber-500/20 pb-3">
              <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/30 shrink-0">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <div className="text-base text-amber-300 font-extrabold">Confirmation & Audit Reason Required</div>
                <div className="text-xs text-amber-400/80 font-normal">Sensitive Configuration Adjustment</div>
              </div>
            </div>

            {/* Warning Details */}
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              Updating <span className="font-bold text-amber-300">{pendingAction}</span> impacts platform financials, security policies, or operational SLAs. An immutable audit record will be stored in the database.
            </p>

            {/* Input Reason Box */}
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider font-mono text-amber-400 font-bold block">
                Reason for Adjustment <span className="text-red-400">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Enter detailed audit reason (e.g., 'Quarterly compliance update', 'Security credential rotation')..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all font-sans"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSensitiveModalOpen(false);
                  setReason("");
                  setPendingAction(null);
                  setPendingData(null);
                }}
                disabled={submitting}
                className="text-xs border-slate-700 text-slate-300 hover:bg-slate-800/80"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={confirmSensitiveChange}
                disabled={submitting}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-5 shadow-lg flex items-center gap-2 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Saving to Database...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm & Save</span>
                  </>
                )}
              </Button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

