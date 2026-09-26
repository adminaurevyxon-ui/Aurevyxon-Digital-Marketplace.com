import React, { useState, useEffect } from "react";
import { safeJson } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { ReviewModal } from "@/components/ReviewModal";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LayoutDashboard, User, Shield, CreditCard, ShoppingBag, Download, Heart, Ticket, Settings, LogOut, Bell, History, Upload, Trash2, Camera, X, Check, Copy, AlertCircle, ArrowUpRight, ArrowDownLeft, ShieldCheck, KeyRound, Store } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { updateUniversalProfile, validateProfileImage } from "@/lib/storageService";
import { isAllowedSellerUser } from "@/config/admin";
import { ImageCropModal } from "@/components/ImageCropModal";
import { ProcessedImageResult } from "@/lib/imageProcessor";
import { SellerOnboarding } from "@/components/SellerOnboarding";

export default function UserDashboard() {
  const { user, token, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [dashboardData, setDashboardData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showSellerOnboarding, setShowSellerOnboarding] = useState(false);
  
  useEffect(() => {
    if (!token) {
      navigate("/");
      return;
    }
    fetchData();
  }, [token]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dashRes, ticketsRes, reviewsRes] = await Promise.all([
        fetch("/api/dashboard", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/tickets", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/user/reviews", { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      const checkJson = async (res: Response) => {
          if (!res.ok) return {};
          try {
            const contentType = res.headers.get("content-type") || "";
            if (!contentType.includes("application/json")) {
              return {};
            }
            return await res.json();
          } catch(e) {
            return {};
          }
      };

      const dash = await checkJson(dashRes);
      const tickets = await checkJson(ticketsRes);
      const reviews = await checkJson(reviewsRes);
      const wishlistRes = await fetch("/api/wishlists", { headers: { Authorization: `Bearer ${token}` } });
      const wishlist = await checkJson(wishlistRes);

      setDashboardData({ ...dash, tickets: tickets.tickets, reviews: reviews.reviews, wishlist: wishlist.wishlists || wishlist.items });
    } catch (err) {
      console.warn(err);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "purchases", label: "My Purchases", icon: ShoppingBag },
    { id: "downloads", label: "Downloads & Licenses", icon: Download },
    { id: "wishlist", label: "Wishlist", icon: Heart },
    { id: "tickets", label: "Support Tickets", icon: Ticket },
    { id: "billing", label: "Billing & Invoices", icon: CreditCard },
    { id: "profile", label: "Edit Profile", icon: User },
    { id: "security", label: "Security & 2FA", icon: Shield },
    { id: "preferences", label: "Preferences", icon: Settings },
  ];

  if (false) {
    return <div className="pt-32 pb-20 text-center"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto"></div></div>;
  }

  return (
    <div className="min-h-screen pt-24 pb-20 bg-background flex flex-col">
      <div className="container mx-auto px-4 flex-1 flex flex-col md:flex-row gap-8">
        
        {/* Sidebar */}
        <aside className="w-full md:w-64 shrink-0">
          <div className="bg-[#141428]/80 backdrop-blur-xl border border-border rounded-xl p-4 sticky top-28">
            <div className="flex items-center gap-3 mb-6 p-2">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg border border-indigo-500/30 shrink-0">
                {user?.photoURL && user.photoURL.trim() ? (
                  <img src={user.photoURL} alt={user.name || "User Avatar"} className="w-full h-full object-cover" />
                ) : (
                  user?.name?.charAt(0) || "U"
                )}
              </div>
              <div className="overflow-hidden">
                <h3 className="font-bold text-white leading-tight truncate">{user?.name}</h3>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            
            <nav className="space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                      isActive 
                        ? 'bg-indigo-500/20 text-indigo-400 font-medium border border-indigo-500/30' 
                        : 'text-muted-foreground hover:bg-white/[0.05] hover:text-white border border-transparent'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-muted-foreground'}`} />
                    {tab.label}
                  </button>
                );
              })}
              <div className="pt-4 mt-4 border-t border-border space-y-1">
                {isAllowedSellerUser(user) ? (
                  <Link to="/seller/dashboard">
                    <button
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 transition-colors font-medium"
                    >
                      <Store className="w-4 h-4 text-emerald-400" />
                      Seller Panel
                    </button>
                  </Link>
                ) : (
                  <button
                    onClick={() => setShowSellerOnboarding(true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 transition-colors font-medium"
                  >
                    <Store className="w-4 h-4 text-amber-400" />
                    Seller Account
                  </button>
                )}
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'overview' && <OverviewTab data={dashboardData} />}
              {activeTab === 'purchases' && <PurchasesTab data={dashboardData} token={token} loading={loading} />}
              {activeTab === 'profile' && <ProfileTab user={user} token={token} />}
              {activeTab === 'security' && <SecurityTab user={user} token={token} />}
              {activeTab === 'tickets' && <TicketsTab data={dashboardData} token={token} onRefresh={fetchData} />}
              {activeTab === 'downloads' && <DownloadsTab data={dashboardData} token={token} />}
              {activeTab === 'wishlist' && <WishlistTab data={dashboardData} token={token} onRefresh={fetchData} loading={loading} />}
              {activeTab === 'billing' && <WalletTab data={dashboardData} token={token} onRefresh={fetchData} />}
              {activeTab === 'preferences' && <PreferencesTab token={token} />}
              {/* Add other tabs progressively */}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Seller Account & KYC Onboarding Modal */}
      {showSellerOnboarding && (
        <SellerOnboarding
          isOpen={showSellerOnboarding}
          onClose={() => setShowSellerOnboarding(false)}
          onSuccess={() => {
            setShowSellerOnboarding(false);
            refreshUser();
            fetchData();
          }}
        />
      )}
    </div>
  );
}

function OverviewTab({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-display font-bold">Welcome back!</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-[#141428]/80 border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-lg"><ShoppingBag className="w-6 h-6"/></div>
              <div>
                <p className="text-sm text-muted-foreground">Total Purchases</p>
                <h3 className="text-2xl font-bold">{data?.purchases?.length || 0}</h3>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#141428]/80 border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-pink-500/20 text-pink-400 rounded-lg"><Heart className="w-6 h-6"/></div>
              <div>
                <p className="text-sm text-muted-foreground">Wishlisted Items</p>
                <h3 className="text-2xl font-bold">{data?.wishlist?.length || 0}</h3>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#141428]/80 border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/20 text-blue-400 rounded-lg"><Ticket className="w-6 h-6"/></div>
              <div>
                <p className="text-sm text-muted-foreground">Active Tickets</p>
                <h3 className="text-2xl font-bold">{data?.tickets?.length || 0}</h3>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PurchasesTab({ data, token, loading }: { data: any, token?: string, loading?: boolean }) {
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>({});

  const openReviewModal = (product: any) => {
      setSelectedProduct(product);
      setReviewModalOpen(true);
  };

  const downloadItem = async (orderId: string) => {
    try {
      const res = await fetch(`/api/download/${orderId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Download failed");
      
      const contentDisp = res.headers.get("content-disposition");
      let filename = `purchase-${orderId}.txt`;
      if (contentDisp && contentDisp.includes("filename=")) {
        filename = contentDisp.split("filename=")[1].replace(/"/g, "").trim();
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Download started!");
    } catch(err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white mb-4">Order History</h2>
      {loading ? (
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex flex-col md:flex-row items-center gap-4 p-4 rounded-xl border border-border bg-white/[0.02] animate-pulse">
              <div className="w-16 h-16 rounded-lg bg-muted/40"></div>
              <div className="flex-1 space-y-2 w-full">
                <div className="h-4 bg-muted/40 rounded w-1/3"></div>
                <div className="h-3 bg-muted/40 rounded w-1/4"></div>
              </div>
              <div className="flex gap-2 w-full md:w-auto mt-4 md:mt-0">
                <div className="h-10 w-32 bg-muted/40 rounded"></div>
                <div className="h-10 w-24 bg-muted/40 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      ) : data?.purchases?.length === 0 ? (
        <div className="p-8 text-center border border-border rounded-xl bg-white/[0.02]">
          <p className="text-muted-foreground">You haven't made any purchases yet.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {data?.purchases?.map((p: any) => (
            <div key={p.order_id} className="flex flex-col md:flex-row items-center gap-4 p-4 rounded-xl border border-border bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
              <img src={(p.image_url && p.image_url.trim()) || "/assets/images/market_logo_1784884442864.jpg"} className="w-16 h-16 rounded-lg object-cover" alt={p.title || "Product"} />
              <div className="flex-1 text-left w-full">
                <h4 className="font-bold text-white">{p.title}</h4>
                <p className="text-sm text-muted-foreground">Order: {p.order_id} • ${p.amount}</p>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                  <Button variant="outline" className="border-border w-full md:w-auto cursor-pointer" onClick={() => openReviewModal(p)}>
                      <Star className="w-4 h-4 mr-2" /> Rate Product
                  </Button>
                  <Button className="bg-indigo-500 hover:bg-indigo-600 text-white w-full md:w-auto cursor-pointer" onClick={() => downloadItem(p.order_id)}>
                    <Download className="w-4 h-4 mr-2" /> Download
                  </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {selectedProduct && (
          <ReviewModal 
              isOpen={reviewModalOpen} 
              onClose={() => setReviewModalOpen(false)} 
              product={selectedProduct} 
          />
      )}
    </div>
  );
}

function ProfileTab({ user, token }: { user: any, token: string }) {
  const { refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [saving, setSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [processedImage, setProcessedImage] = useState<ProcessedImageResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRemovePhoto, setIsRemovePhoto] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

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
    toast.success("Avatar cropped & processed!");
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

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Please enter a valid display name.");
      return;
    }

    setSaving(true);
    try {
      await updateUniversalProfile({
        uid: user?.id,
        displayName: name,
        file: selectedFile,
        processedImage,
        isRemovePhoto,
        role: "user",
        token
      });

      await refreshUser();
      setSelectedFile(null);
      setProcessedImage(null);
      setPreviewUrl(null);
      setIsRemovePhoto(false);
      toast.success("User profile & avatar updated successfully in Firebase Storage & Firestore!");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-[#141428]/80 border-border">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <User className="w-5 h-5 text-indigo-400" />
          Edit User Profile
        </CardTitle>
        <CardDescription>Manage your display name and profile picture with permanent Firebase Cloud Storage & Firestore persistence.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Profile Avatar Section */}
        <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-white/5 rounded-xl border border-white/10">
          <div className="relative group">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-3xl border-2 border-indigo-400/50 shadow-xl">
              {currentAvatar && currentAvatar.trim() ? (
                <img src={currentAvatar} alt={name || "User Avatar"} className="w-full h-full object-cover" />
              ) : (
                name?.charAt(0)?.toUpperCase() || "U"
              )}
            </div>
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 p-2 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-500 transition-all"
              title="Upload New Avatar"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 text-center sm:text-left space-y-2">
            <h4 className="font-semibold text-white text-base">Profile Picture</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Allowed formats: <span className="text-indigo-300 font-mono font-bold">PNG, JPG, JPEG</span> (Max file size: <span className="text-indigo-300 font-mono font-bold">5MB</span>).
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
                Select Image
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
              <p className="text-xs text-emerald-400 font-mono mt-1">
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

        <div>
          <label className="text-sm font-medium text-gray-300 mb-1 block">Full Display Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} className="bg-background border-border text-white" placeholder="Enter display name" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-300 mb-1 block">Email Address (Read Only)</label>
          <Input value={user?.email} disabled className="bg-background border-border opacity-50 text-gray-400 cursor-not-allowed" />
        </div>

        <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-6 rounded-lg transition-all shadow-md shadow-indigo-600/30">
          {saving ? "Uploading & Saving to Firebase..." : "Save Profile Changes"}
        </Button>

        <ImageCropModal
          isOpen={isCropOpen}
          file={cropFile}
          onClose={() => setIsCropOpen(false)}
          onCropComplete={handleCropComplete}
        />
      </CardContent>
    </Card>
  );
}



function SecurityTab({ user, token }: { user: any, token: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Real 2FA State
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [checking2FA, setChecking2FA] = useState(true);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; otpauth_url: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  useEffect(() => {
    if (token) {
      fetch("/api/user/security", { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.ok ? safeJson(res) : null)
        .then(data => {
          if (data && data.security) {
            setTwoFactorEnabled(!!data.security.twoFactorEnabled);
          }
        })
        .catch(err => console.warn("Security status fetch error:", err))
        .finally(() => setChecking2FA(false));
    }
  }, [token]);

  const handleUpdate = async () => {
    if (!currentPassword || !newPassword) {
      toast.error("Please enter both current and new password");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/user/security", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      if (!res.ok) {
        const errData = await safeJson(res, {});
        throw new Error(errData.error || "Failed to update security settings");
      }
      toast.success("Security settings updated successfully");
      setCurrentPassword("");
      setNewPassword("");
    } catch(e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const start2FASetup = async () => {
    try {
      const res = await fetch("/api/user/2fa/setup", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to initialize 2FA setup");
      const data = await safeJson(res);
      setSetupData(data);
      setVerifyCode("");
      setRecoveryCodes(null);
      setSetupModalOpen(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to start 2FA setup");
    }
  };

  const confirm2FA = async () => {
    if (!setupData || !verifyCode.trim()) {
      toast.error("Please enter the 6-digit code from your authenticator app");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/user/2fa/verify", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ secret: setupData.secret, token: verifyCode.trim() })
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data?.error || "Invalid verification code");

      setTwoFactorEnabled(true);
      setRecoveryCodes(data.recoveryCodes || []);
      toast.success("Two-Factor Authentication is now enabled!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setVerifying(false);
    }
  };

  const disable2FA = async () => {
    if (!confirm("Are you sure you want to disable Two-Factor Authentication?")) return;
    try {
      const res = await fetch("/api/user/2fa/disable", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to disable 2FA");
      setTwoFactorEnabled(false);
      setSetupModalOpen(false);
      setRecoveryCodes(null);
      toast.success("Two-Factor Authentication has been disabled");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <Card className="bg-[#141428]/80 border-border">
      <CardHeader>
        <CardTitle>Security & Password</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Current Password</label>
          <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="bg-background border-border" />
        </div>
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">New Password</label>
          <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="bg-background border-border" />
        </div>
        <Button onClick={handleUpdate} disabled={loading} className="bg-indigo-500 hover:bg-indigo-600">
          {loading ? "Updating..." : "Update Password"}
        </Button>

        <div className="mt-8 pt-6 border-t border-border">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-indigo-400" />
            Two-Factor Authentication (2FA)
          </h3>
          <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-border rounded-xl">
            <div>
              <h4 className="font-semibold flex items-center gap-2">
                Authenticator App (TOTP)
                {twoFactorEnabled && (
                  <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-mono">
                    <ShieldCheck className="w-3 h-3" /> Configured & Active
                  </span>
                )}
              </h4>
              <p className="text-sm text-muted-foreground">
                {twoFactorEnabled
                  ? "Standard RFC 6238 TOTP authentication is currently active on your account."
                  : "Protect your account with Google Authenticator, Microsoft Authenticator, or Authy."}
              </p>
            </div>
            {twoFactorEnabled ? (
              <Button variant="outline" className="border-red-500/40 text-red-400 hover:bg-red-500/10" onClick={disable2FA}>
                Disable 2FA
              </Button>
            ) : (
              <Button variant="outline" className="border-border text-white hover:bg-indigo-500/10" onClick={start2FASetup}>
                Enable 2FA
              </Button>
            )}
          </div>
        </div>

        {/* 2FA Setup Modal */}
        {setupModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[#141428] border border-border rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
              <button 
                onClick={() => setSetupModalOpen(false)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-1">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Shield className="w-5 h-5 text-indigo-400" />
                  {recoveryCodes ? "Save Backup Recovery Codes" : "Configure Authenticator"}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {recoveryCodes 
                    ? "Keep these one-time codes in a secure password manager. Each code can be used once if you lose access to your device."
                    : "Use Google Authenticator, Microsoft Authenticator, or 1Password to link your account."}
                </p>
              </div>

              {recoveryCodes ? (
                <div className="space-y-4">
                  <div className="p-4 bg-black/60 rounded-xl border border-white/10 grid grid-cols-2 gap-2">
                    {recoveryCodes.map((code, idx) => (
                      <div key={idx} className="font-mono text-sm text-emerald-400 font-semibold p-1.5 bg-white/[0.03] rounded border border-white/5 text-center">
                        {code}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline"
                      className="flex-1 border-border"
                      onClick={() => {
                        navigator.clipboard.writeText(recoveryCodes.join("\n"));
                        toast.success("All backup recovery codes copied to clipboard!");
                      }}
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Codes
                    </Button>
                    <Button 
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white"
                      onClick={() => setSetupModalOpen(false)}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 font-sans text-xs">
                  <div className="space-y-2 p-3.5 bg-black/40 rounded-xl border border-white/5">
                    <p className="font-semibold text-white text-sm">Step 1: Enter Secret Key</p>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      In your authenticator app, tap <strong>"Add Account"</strong>, choose <strong>"Enter a setup key"</strong>, and enter this key:
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="p-2.5 bg-white/[0.04] border border-white/10 rounded-lg font-mono text-indigo-300 font-bold text-sm tracking-wider flex-1 select-all break-all">
                        {setupData?.secret}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-border shrink-0"
                        onClick={() => {
                          if (setupData?.secret) {
                            navigator.clipboard.writeText(setupData.secret);
                            toast.success("Secret key copied!");
                          }
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 p-3.5 bg-black/40 rounded-xl border border-white/5">
                    <p className="font-semibold text-white text-sm">Step 2: Enter 6-Digit Code</p>
                    <p className="text-muted-foreground text-xs">
                      Enter the 6-digit verification code generated by your Authenticator app to confirm setup:
                    </p>
                    <Input 
                      placeholder="000000"
                      maxLength={6}
                      value={verifyCode}
                      onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                      className="bg-background border-border text-center font-mono text-lg tracking-widest text-white mt-2"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setSetupModalOpen(false)}
                      className="flex-1 border-border"
                    >
                      Cancel
                    </Button>
                    <Button 
                      disabled={verifying || verifyCode.length !== 6}
                      onClick={confirm2FA}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                    >
                      {verifying ? "Verifying..." : "Verify & Activate"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TicketsTab({ data, token, onRefresh }: { data: any, token: string, onRefresh?: () => void }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message })
      });
      if (!res.ok) throw new Error("Failed to create ticket");
      toast.success("Support ticket created");
      setSubject("");
      setMessage("");
      if (onRefresh) onRefresh();
    } catch(e: any) {
      toast.error(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-[#141428]/80 border-border">
        <CardHeader>
          <CardTitle>Open Support Ticket</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Subject</label>
              <Input required value={subject} onChange={e => setSubject(e.target.value)} className="bg-background border-border" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Message</label>
              <textarea required value={message} onChange={e => setMessage(e.target.value)} className="w-full min-h-[120px] bg-background border border-border rounded-md p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
            <Button type="submit" disabled={creating} className="bg-indigo-500">
              {creating ? "Submitting..." : "Submit Ticket"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-[#141428]/80 border-border">
        <CardHeader>
          <CardTitle>My Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.tickets?.length === 0 ? (
            <p className="text-muted-foreground text-sm">No tickets found.</p>
          ) : (
            <div className="space-y-4">
              {data?.tickets?.map((t: any) => (
                <div key={t.id} className="p-4 bg-white/[0.02] border border-border rounded-xl">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-bold">{t.subject}</h4>
                    <span className={`text-xs px-2 py-1 rounded ${t.status === 'open' ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'}`}>
                      {t.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">{t.message}</p>
                  {t.resolution && (
                    <div className="mt-4 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                      <p className="text-xs font-semibold text-indigo-400 mb-1">Support Resolution:</p>
                      <p className="text-sm text-gray-300">{t.resolution}</p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">Created: {new Date(t.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DownloadsTab({ data, token }: { data: any; token?: string }) {
    const [selectedLicense, setSelectedLicense] = useState<any>(null);

    const downloadItem = async (orderId: string) => {
        try {
            const res = await fetch(`/api/download/${orderId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) throw new Error("Download failed");
            
            const contentDisp = res.headers.get("content-disposition");
            let filename = `purchase-${orderId}.txt`;
            if (contentDisp && contentDisp.includes("filename=")) {
              filename = contentDisp.split("filename=")[1].replace(/"/g, "").trim();
            }

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            toast.success("Download started!");
        } catch(err: any) {
            toast.error(err.message);
        }
    };
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-display font-bold">Downloads & Licenses</h2>
      {data?.purchases?.length === 0 ? (
        <div className="p-8 text-center border border-border rounded-xl bg-white/[0.02]">
          <p className="text-muted-foreground">You haven't acquired any licenses.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {data?.purchases?.map((p: any) => (
            <div key={p.order_id} className="p-4 rounded-xl border border-border bg-white/[0.02] hover:bg-white/[0.04] transition-colors flex flex-col md:flex-row gap-4 items-center">
              <img src={(p.image_url && p.image_url.trim()) || "/assets/images/market_logo_1784884442864.jpg"} className="w-16 h-16 rounded-lg object-cover" alt={p.title || "Product"} />
              <div className="flex-1 text-left w-full">
                <h4 className="font-bold text-white">{p.title}</h4>
                <p className="text-sm text-muted-foreground">License ID: {p.order_id}</p>
                <div className="mt-2 text-xs text-indigo-400 font-mono bg-indigo-500/10 inline-block px-2 py-1 rounded">
                  {p.mode === 'Exclusive' ? 'Exclusive Full-Ownership License' : 'Standard License'}
                </div>
              </div>
              <div className="flex gap-2 w-full md:w-auto mt-4 md:mt-0">
                <Button 
                  variant="outline" 
                  className="border-border w-full md:w-auto cursor-pointer"
                  onClick={() => setSelectedLicense(p)}
                >
                  View License
                </Button>
                <Button className="bg-indigo-500 hover:bg-indigo-600 w-full md:w-auto cursor-pointer" onClick={() => downloadItem(p.order_id)}>
                  <Download className="w-4 h-4 mr-2"/> Download
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedLicense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#141428] border border-border rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border/40">
              <h3 className="font-bold text-white text-lg">Digital Asset License Certificate</h3>
              <button 
                onClick={() => setSelectedLicense(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 font-sans text-xs">
              <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-1">
                <p className="text-muted-foreground uppercase text-[10px] font-mono">Product Title</p>
                <p className="font-bold text-white text-sm">{selectedLicense.title}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                  <p className="text-muted-foreground uppercase text-[10px] font-mono">License Key / Certificate</p>
                  <p className="font-mono text-emerald-400 font-bold mt-1">AUR-LIC-{selectedLicense.order_id?.substring(0, 12).toUpperCase()}</p>
                </div>
                <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                  <p className="text-muted-foreground uppercase text-[10px] font-mono">License Grant Scope</p>
                  <p className="font-bold text-indigo-300 mt-1">{selectedLicense.mode === 'Exclusive' ? 'Exclusive Ownership' : 'Commercial Standard'}</p>
                </div>
              </div>
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                <p className="text-indigo-300 text-[11px] leading-relaxed">
                  ✓ Verified cryptographic ownership recorded on Aurevyxon Ledger. Valid for single-entity deployment and worldwide commercial distribution.
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button 
                onClick={() => {
                  navigator.clipboard.writeText(`AUR-LIC-${selectedLicense.order_id?.substring(0, 12).toUpperCase()}`);
                  toast.success("License Key copied to clipboard!");
                }}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
              >
                Copy License Key
              </Button>
              <Button 
                variant="outline"
                onClick={() => setSelectedLicense(null)}
                className="border-border text-gray-300"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



function WishlistTab({ data, token, onRefresh, loading }: { data: any, token?: string, onRefresh?: () => void, loading?: boolean }) {
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemove = async (listingId: string) => {
    if (!token) return;
    setRemovingId(listingId);
    try {
      const res = await fetch(`/api/wishlists/${listingId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to update wishlist");
      toast.success("Removed from wishlist");
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove item");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold">My Wishlist</h2>
        <span className="text-xs text-muted-foreground bg-white/[0.04] px-3 py-1 rounded-full border border-white/5">
          {data?.wishlist?.length || 0} saved items
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-white/[0.02] overflow-hidden flex flex-col h-full animate-pulse">
              <div className="h-32 bg-muted/40"></div>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <div className="h-5 bg-muted/40 rounded w-3/4 mb-1"></div>
                <div className="h-4 bg-muted/40 rounded w-1/4 mb-4"></div>
                <div className="mt-auto flex gap-2">
                  <div className="h-10 bg-muted/40 rounded flex-1"></div>
                  <div className="h-10 bg-muted/40 rounded flex-1"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : data?.wishlist?.length === 0 ? (
        <div className="p-8 text-center border border-border rounded-xl bg-white/[0.02] space-y-3">
          <Heart className="w-10 h-10 text-muted-foreground/40 mx-auto" />
          <p className="text-muted-foreground">Your wishlist is empty.</p>
          <Link to="/">
            <Button variant="outline" className="border-border text-xs mt-2">Browse Marketplace</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data?.wishlist?.map((item: any) => (
            <div key={item.wishlist_id || item.id} className="rounded-xl border border-border bg-white/[0.02] overflow-hidden flex flex-col h-full hover:border-pink-500/30 transition-all relative group">
              <div className="h-36 bg-muted/50 overflow-hidden relative">
                <img 
                  src={(item.image_url && item.image_url.trim()) || "/assets/images/market_logo_1784884442864.jpg"} 
                  className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-300" 
                  alt={item.title} 
                  referrerPolicy="no-referrer" 
                />
                <button
                  type="button"
                  onClick={() => handleRemove(item.id || item.listing_id)}
                  disabled={removingId === (item.id || item.listing_id)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors backdrop-blur-sm"
                  title="Remove from Wishlist"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-semibold text-lg line-clamp-1 mb-1">{item.title}</h3>
                <p className="text-emerald-400 font-bold mb-4">${Number(item.price || 0).toFixed(2)}</p>
                <div className="mt-auto flex gap-2">
                  <Link to={`/listing/${item.id || item.listing_id}`} className="flex-1">
                    <Button variant="outline" className="w-full border-border">View</Button>
                  </Link>
                  <Link to={`/listing/${item.id || item.listing_id}`} className="flex-1">
                    <Button className="w-full bg-pink-500 hover:bg-pink-600">Buy Now</Button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WalletTab({ data, token, onRefresh }: { data: any; token?: string; onRefresh?: () => void }) {
    const [methods, setMethods] = useState<any[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loadingTx, setLoadingTx] = useState(false);
    const [showTopUpModal, setShowTopUpModal] = useState(false);
    const [topUpAmount, setTopUpAmount] = useState<number>(25);
    const [customAmount, setCustomAmount] = useState<string>("");
    const [isProcessingPay, setIsProcessingPay] = useState(false);

    // Add Method Modal State
    const [showAddMethodModal, setShowAddMethodModal] = useState(false);
    const [methodType, setMethodType] = useState<"card" | "upi" | "bank">("card");
    const [cardHolder, setCardHolder] = useState("");
    const [cardBrand, setCardBrand] = useState("Visa");
    const [cardLast4, setCardLast4] = useState("");
    const [cardExpiry, setCardExpiry] = useState("");
    const [upiId, setUpiId] = useState("");
    const [bankHolder, setBankHolder] = useState("");
    const [bankName, setBankName] = useState("");
    const [bankLast4, setBankLast4] = useState("");
    const [isSavingMethod, setIsSavingMethod] = useState(false);

    const fetchMethods = () => {
      if (!token) return;
      fetch('/api/payout/methods', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => safeJson(r, { methods: [] }))
        .then(d => setMethods(d.methods || []))
        .catch(e => console.warn(e));
    };

    const fetchTransactions = () => {
      if (!token) return;
      setLoadingTx(true);
      fetch('/api/user/wallet/transactions', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => safeJson(r, { transactions: [] }))
        .then(d => setTransactions(d.transactions || []))
        .catch(e => console.warn(e))
        .finally(() => setLoadingTx(false));
    };

    useEffect(() => {
      if (token) {
        fetchMethods();
        fetchTransactions();
      }
    }, [token]);

    const handleRazorpayTopUp = async () => {
      const finalAmount = customAmount ? parseFloat(customAmount) : topUpAmount;
      if (!finalAmount || isNaN(finalAmount) || finalAmount < 1) {
        toast.error("Please enter a valid top-up amount ($1 minimum)");
        return;
      }

      setIsProcessingPay(true);
      try {
        const orderRes = await fetch("/api/user/wallet/razorpay-order", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ amount: finalAmount })
        });
        const orderData = await safeJson(orderRes);
        if (!orderRes.ok) throw new Error(orderData.error || "Failed to initialize payment order");

        if (typeof (window as any).Razorpay === "undefined") {
          throw new Error("Payment gateway is loading. Please try again in a few seconds.");
        }

        const options = {
          key: orderData.keyId,
          amount: orderData.amount,
          currency: orderData.currency || "INR",
          name: "AUREVYXON",
          description: `Wallet Balance Top-Up ($${finalAmount.toFixed(2)})`,
          order_id: orderData.orderId,
          handler: async (response: any) => {
            try {
              const verifyRes = await fetch("/api/user/wallet/razorpay-verify", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  amount: finalAmount
                })
              });
              const verifyData = await safeJson(verifyRes);
              if (!verifyRes.ok) throw new Error(verifyData.error || "Payment verification failed");

              toast.success(`Successfully added $${finalAmount.toFixed(2)} to your wallet!`);
              setShowTopUpModal(false);
              setCustomAmount("");
              if (onRefresh) onRefresh();
              fetchTransactions();
            } catch (vErr: any) {
              toast.error(vErr.message || "Failed to verify transaction");
            }
          },
          prefill: {
            name: data?.user?.name || "",
            email: data?.user?.email || ""
          },
          theme: {
            color: "#6366f1"
          }
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.on("payment.failed", (resp: any) => {
          toast.error(`Payment failed: ${resp.error?.description || "Unknown error"}`);
        });
        rzp.open();
      } catch (err: any) {
        toast.error(err.message || "Could not process wallet top-up");
      } finally {
        setIsProcessingPay(false);
      }
    };

    const handleSaveMethod = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSavingMethod(true);
      try {
        let payload: any = { method_type: methodType, is_default: methods.length === 0 };
        if (methodType === "card") {
          const cleanLast4 = cardLast4.trim().slice(-4);
          if (cleanLast4.length !== 4 || isNaN(Number(cleanLast4))) {
            throw new Error("Please enter a valid 4-digit card number suffix");
          }
          payload.details = {
            cardholder: cardHolder.trim() || "Cardholder",
            brand: cardBrand,
            last4: cleanLast4,
            expiry: cardExpiry.trim() || "12/28"
          };
        } else if (methodType === "upi") {
          if (!upiId.includes("@")) throw new Error("Please enter a valid UPI ID (e.g., name@okbank)");
          payload.details = { upi_id: upiId.trim() };
        } else {
          const cleanAcc4 = bankLast4.trim().slice(-4);
          if (cleanAcc4.length !== 4) throw new Error("Please enter last 4 digits of the account");
          payload.details = {
            account_holder: bankHolder.trim() || "Account Holder",
            bank_name: bankName.trim() || "Bank",
            last4: cleanAcc4
          };
        }

        const res = await fetch('/api/payout/methods', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
        toast.success("Payment method saved successfully!");
        setShowAddMethodModal(false);
        // Reset
        setCardLast4("");
        setCardHolder("");
        setUpiId("");
        setBankLast4("");
        fetchMethods();
      } catch (err: any) {
        toast.error(err.message || "Failed to add payment method");
      } finally {
        setIsSavingMethod(false);
      }
    };

    const removeMethod = async (id: string) => {
      if (!confirm("Are you sure you want to remove this payment method?")) return;
      try {
        const res = await fetch(`/api/payout/methods/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("Failed to delete method");
        setMethods(methods.filter(m => m.id !== id));
        toast.success("Payment method removed!");
      } catch (err: any) { 
        toast.error(err.message); 
      }
    };

    return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold">My Wallet & Billing</h2>
          <p className="text-sm text-muted-foreground">Manage your on-platform store credit, payment options, and ledger history.</p>
        </div>
      </div>

      {/* Balance Card */}
      <Card className="bg-[#141428]/90 border-border relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <CardContent className="p-6 relative">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Available Store Credit</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-4xl font-bold text-emerald-400 font-mono">
              ${(Number(data?.balance) || 0).toFixed(2)}
            </h3>
            <span className="text-xs text-muted-foreground">USD</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium shadow-lg shadow-emerald-500/20" onClick={() => setShowTopUpModal(true)}>
              <CreditCard className="w-4 h-4 mr-2" /> Top Up Balance
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Payment Methods Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">Saved Payment Methods</h3>
            <p className="text-xs text-muted-foreground">Securely linked payment accounts for checkout and payouts.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowAddMethodModal(true)} className="border-border text-xs">
            + Add Method
          </Button>
        </div>

        {methods.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-border bg-white/[0.01] text-center space-y-2">
            <p className="text-sm text-muted-foreground">No payment methods linked yet.</p>
            <Button variant="outline" size="sm" onClick={() => setShowAddMethodModal(true)} className="border-border text-xs">
              Link a Card, UPI, or Bank Account
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {methods.map((m) => {
              let detailsObj: any = {};
              try { detailsObj = typeof m.details === "string" ? JSON.parse(m.details) : (m.details || {}); } catch(e) {}

              return (
                <div key={m.id} className="p-4 rounded-xl border border-border bg-white/[0.02] flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-10 bg-white/[0.04] border border-white/5 rounded-lg flex items-center justify-center">
                      <CreditCard className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-white">
                        {m.method_type === "upi" ? (
                          <span>UPI: {detailsObj.upi_id || "upi@bank"}</span>
                        ) : m.method_type === "bank" ? (
                          <span>{detailsObj.bank_name || "Bank Account"} •••• {detailsObj.last4 || "0000"}</span>
                        ) : (
                          <span>{detailsObj.brand || "Card"} •••• •••• •••• {detailsObj.last4 || "4242"}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {detailsObj.cardholder || detailsObj.account_holder || "Active Payment Account"}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xs" onClick={() => removeMethod(m.id)}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Transaction History Section */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">Wallet Transaction History</h3>
            <p className="text-xs text-muted-foreground">Real-time ledger of your wallet deposits, charges, and purchases.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchTransactions} className="text-xs text-muted-foreground">
            Refresh
          </Button>
        </div>

        {loadingTx ? (
          <div className="p-6 text-center text-xs text-muted-foreground animate-pulse">
            Loading transactions...
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-6 rounded-xl border border-border bg-white/[0.01] text-center">
            <p className="text-sm text-muted-foreground">No wallet transactions recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const isCredit = tx.type === "credit" || tx.type === "topup";
              return (
                <div key={tx.id} className="p-3.5 rounded-xl border border-border/80 bg-white/[0.02] flex items-center justify-between hover:bg-white/[0.03] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isCredit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                      {isCredit ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{tx.description || (isCredit ? "Wallet Top-up" : "Purchase Debit")}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {new Date(tx.created_at).toLocaleDateString()} at {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-mono font-bold text-sm ${isCredit ? 'text-emerald-400' : 'text-gray-300'}`}>
                      {isCredit ? `+$${Number(tx.amount).toFixed(2)}` : `-$${Number(tx.amount).toFixed(2)}`}
                    </p>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/[0.04] text-muted-foreground">
                      {tx.status || "Completed"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top Up Modal */}
      {showTopUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#141428] border border-border rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <button 
              onClick={() => setShowTopUpModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                Add Funds to Wallet
              </h3>
              <p className="text-xs text-muted-foreground">
                Select an amount to securely add via Razorpay (Cards, UPI, NetBanking).
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-muted-foreground block">Select Amount (USD)</label>
              <div className="grid grid-cols-4 gap-2">
                {[10, 25, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => { setTopUpAmount(amt); setCustomAmount(""); }}
                    className={`p-2.5 rounded-xl border text-sm font-mono font-bold transition-all ${
                      !customAmount && topUpAmount === amt
                        ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30"
                        : "bg-white/[0.02] border-border text-muted-foreground hover:text-white hover:border-white/20"
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Or enter custom amount ($)</label>
                <Input
                  type="number"
                  placeholder="e.g. 75"
                  min="1"
                  step="1"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="bg-background border-border font-mono text-base"
                />
              </div>

              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Top-up amount:</span>
                  <span className="font-mono text-white font-semibold">
                    ${(customAmount ? parseFloat(customAmount) || 0 : topUpAmount).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Gateway fee:</span>
                  <span className="font-mono text-emerald-400 font-semibold">$0.00 (Free)</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowTopUpModal(false)} className="flex-1 border-border">
                Cancel
              </Button>
              <Button 
                disabled={isProcessingPay}
                onClick={handleRazorpayTopUp}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
              >
                {isProcessingPay ? "Processing..." : "Pay with Razorpay"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Payment Method Modal */}
      {showAddMethodModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#141428] border border-border rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <button 
              onClick={() => setShowAddMethodModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-1">
              <h3 className="text-xl font-bold">Add Payment Method</h3>
              <p className="text-xs text-muted-foreground">Save your payment details for one-click checkout.</p>
            </div>

            <div className="flex rounded-xl bg-white/[0.04] p-1 border border-border">
              <button
                type="button"
                onClick={() => setMethodType("card")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${methodType === "card" ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-white"}`}
              >
                Card
              </button>
              <button
                type="button"
                onClick={() => setMethodType("upi")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${methodType === "upi" ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-white"}`}
              >
                UPI ID
              </button>
              <button
                type="button"
                onClick={() => setMethodType("bank")}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${methodType === "bank" ? "bg-indigo-600 text-white" : "text-muted-foreground hover:text-white"}`}
              >
                Bank
              </button>
            </div>

            <form onSubmit={handleSaveMethod} className="space-y-4">
              {methodType === "card" && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Cardholder Name</label>
                    <Input 
                      placeholder="e.g. John Doe"
                      value={cardHolder}
                      onChange={e => setCardHolder(e.target.value)}
                      className="bg-background border-border text-sm"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Card Brand</label>
                      <select 
                        value={cardBrand}
                        onChange={e => setCardBrand(e.target.value)}
                        className="w-full h-10 px-3 rounded-md bg-background border border-border text-sm text-white"
                      >
                        <option value="Visa">Visa</option>
                        <option value="Mastercard">Mastercard</option>
                        <option value="RuPay">RuPay</option>
                        <option value="American Express">American Express</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Last 4 Digits</label>
                      <Input 
                        placeholder="e.g. 4242"
                        maxLength={4}
                        value={cardLast4}
                        onChange={e => setCardLast4(e.target.value.replace(/\D/g, ""))}
                        className="bg-background border-border font-mono text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Expiry Date (MM/YY)</label>
                    <Input 
                      placeholder="12/28"
                      maxLength={5}
                      value={cardExpiry}
                      onChange={e => setCardExpiry(e.target.value)}
                      className="bg-background border-border font-mono text-sm"
                    />
                  </div>
                </>
              )}

              {methodType === "upi" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">UPI ID</label>
                  <Input 
                    placeholder="e.g. yourname@okhdfcbank"
                    value={upiId}
                    onChange={e => setUpiId(e.target.value)}
                    className="bg-background border-border text-sm"
                    required
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Supports Google Pay, PhonePe, Paytm, and BHIM.</p>
                </div>
              )}

              {methodType === "bank" && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Account Holder Name</label>
                    <Input 
                      placeholder="e.g. Jane Doe"
                      value={bankHolder}
                      onChange={e => setBankHolder(e.target.value)}
                      className="bg-background border-border text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Bank Name</label>
                    <Input 
                      placeholder="e.g. HDFC Bank"
                      value={bankName}
                      onChange={e => setBankName(e.target.value)}
                      className="bg-background border-border text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Account Number (Last 4 digits)</label>
                    <Input 
                      placeholder="e.g. 8832"
                      maxLength={4}
                      value={bankLast4}
                      onChange={e => setBankLast4(e.target.value.replace(/\D/g, ""))}
                      className="bg-background border-border font-mono text-sm"
                      required
                    />
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowAddMethodModal(false)} className="flex-1 border-border">
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={isSavingMethod}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  {isSavingMethod ? "Saving..." : "Save Method"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function PreferencesTab({ token }: { token?: string }) {
    const [prefs, setPrefs] = useState({ order_updates: true, promos: false, theme: 'dark' });
    
    useEffect(() => {
        if(token) {
           fetch('/api/user/preferences', { headers: { Authorization: `Bearer ${token}` } })
           .then(r=>safeJson(r))
           .then(d=> { if(d.preferences) setPrefs(JSON.parse(d.preferences)); }).catch(e=>console.warn(e));
        }
    }, [token]);
    
    const savePrefs = async (newPrefs: any) => {
        setPrefs(newPrefs);
        if(token) {
           await fetch('/api/user/preferences', {
               method: 'POST',
               headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
               body: JSON.stringify(newPrefs)
           });
           toast.success("Preferences saved!");
        }
    };
  
    return (
    <div className="space-y-6">
      <h2 className="text-2xl font-display font-bold">Preferences</h2>
      
      <Card className="bg-[#141428]/80 border-border">
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Choose what we notify you about.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-border rounded-xl">
            <div>
              <p className="font-bold text-white">Order Updates</p>
              <p className="text-sm text-muted-foreground">Get notified about your purchases.</p>
            </div>
            <div 
       className={`w-12 h-6 rounded-full flex items-center px-1 cursor-pointer ${prefs.order_updates ? 'bg-indigo-500' : 'bg-muted border border-border'}`}
       onClick={() => savePrefs({...prefs, order_updates: !prefs.order_updates})}
   >
      <div className={`w-4 h-4 rounded-full transition-transform ${prefs.order_updates ? 'bg-white translate-x-6' : 'bg-muted-foreground'}`}></div>
   </div>
          </div>
          <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-border rounded-xl">
            <div>
              <p className="font-bold text-white">Promotional Emails</p>
              <p className="text-sm text-muted-foreground">Receive discounts and offers.</p>
            </div>
            <div 
       className={`w-12 h-6 rounded-full flex items-center px-1 cursor-pointer ${prefs.promos ? 'bg-indigo-500' : 'bg-muted border border-border'}`}
       onClick={() => savePrefs({...prefs, promos: !prefs.promos})}
   >
      <div className={`w-4 h-4 rounded-full transition-transform ${prefs.promos ? 'bg-white translate-x-6' : 'bg-muted-foreground'}`}></div>
   </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-[#141428]/80 border-border">
        <CardHeader>
          <CardTitle>Theme</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <button 
      className={`flex-1 p-4 rounded-xl border text-center font-bold ${prefs.theme === 'dark' ? 'border-indigo-500/50 bg-[#0A0A1E] text-white shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'border-border bg-white/[0.02] text-muted-foreground'}`}
      onClick={() => savePrefs({...prefs, theme: 'dark'})}
   >
      Dark Mode {prefs.theme === 'dark' ? '(Active)' : ''}
   </button>
            <button 
      className={`flex-1 p-4 rounded-xl border text-center font-bold ${prefs.theme === 'light' ? 'border-indigo-500/50 bg-gray-100 text-gray-900 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'border-border bg-white/[0.02] text-muted-foreground'}`}
      onClick={() => savePrefs({...prefs, theme: 'light'})}
   >
      Light Mode {prefs.theme === 'light' ? '(Active)' : ''}
   </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
