import React, { useState, useEffect } from "react";
import { safeJson } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  LayoutDashboard, Package, DollarSign, Activity, FileText, Settings, Wallet, 
  BarChart, MessageSquare, ShieldCheck, Upload, Trash2, Camera, X, Store, Zap, 
  Clock, ShieldAlert, AlertTriangle, ArrowUpRight, CheckCircle, RefreshCw, 
  AlertCircle, Building2, Smartphone, Check, Lock, ChevronRight, Info, History, 
  ArrowDownRight, CreditCard, ExternalLink, Star, Users, User, Shield
} from "lucide-react";
import { isAllowedAdminUser, isAllowedSellerUser } from "@/config/admin";
import { motion, AnimatePresence } from "framer-motion";
import { KYCVerificationForm } from "@/components/KYCVerificationForm";
import { PendingSellerReview } from "@/components/PendingSellerReview";
import { SellerMessageAdminModal } from "@/components/seller/SellerMessageAdminModal";
import { updateUniversalProfile, validateProfileImage } from "@/lib/storageService";
import { ImageCropModal } from "@/components/ImageCropModal";
import { ProcessedImageResult } from "@/lib/imageProcessor";
import { FlashDiscountModal } from "@/components/FlashDiscountModal";
import { FlashSaleTimer } from "@/components/FlashSaleTimer";

export default function SellerDashboard() {
  const { user, token, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [dashboardData, setDashboardData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [msgModalOpen, setMsgModalOpen] = useState(false);
  const [reverification, setReverification] = useState<any>(null);

  const kycStatus = String(dashboardData?.seller_profile?.kyc_status || dashboardData?.sellerProfile?.kyc_status || user?.seller_profile?.kyc_status || (user as any)?.kyc_status || 'unverified').toLowerCase();
  const sellerStatus = String(dashboardData?.seller_profile?.status || user?.seller_profile?.status || (user as any)?.seller_status || 'ACTIVE').toUpperCase();
  const isUserBannedOrSuspended = user?.is_banned || user?.is_suspended || user?.status === 'SUSPENDED' || user?.status === 'BANNED' || user?.status === 'DELETED' || sellerStatus === 'SUSPENDED' || sellerStatus === 'BANNED' || sellerStatus === 'DELETED';
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin' || isAllowedAdminUser(user);
  const isApprovedSeller = !isUserBannedOrSuspended && (isAdmin || isAllowedSellerUser(user) || ((kycStatus === 'verified' || kycStatus === 'approved') && user?.role === 'seller'));

  useEffect(() => {
    if (!token) {
      navigate("/");
      return;
    }
    fetchData();
    fetchReverificationStatus();
    const interval = setInterval(fetchReverificationStatus, 30000);
    return () => clearInterval(interval);
  }, [token, user]);

  const fetchReverificationStatus = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/seller/reverification/status", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReverification(data);
      }
    } catch (e) {
      console.warn("Failed to fetch reverification status:", e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const dashRes = await fetch("/api/dashboard", { headers: { Authorization: `Bearer ${token}` } });
      const text = await dashRes.text();
      let dash;
      try {
          dash = JSON.parse(text);
      } catch(e) {
          console.error("Failed to parse JSON for seller dashboard:", text.substring(0, 100));
          dash = {};
      }
      setDashboardData(dash);
    } catch (err) {
      console.warn(err);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "products", label: "Products", icon: Package },
    { id: "sales", label: "Sales & Orders", icon: DollarSign },
    { id: "analytics", label: "Analytics", icon: Activity },
    { id: "wallet", label: "Wallet & Payouts", icon: Wallet },
    { id: "reviews", label: "Reviews Received", icon: Star },
    { id: "customers", label: "Customers", icon: Users },
    { id: "coupons", label: "Coupons", icon: FileText },
    { id: "flash-discounts", label: "Flash Sales (Timer)", icon: Zap },
    { id: "store-settings", label: "Store Settings", icon: Settings },
    { id: "kyc", label: "KYC Verification", icon: ShieldCheck },
  ];

  if (loading && !dashboardData?.user && !dashboardData?.listings) {
    return (
      <div className="min-h-screen pt-32 pb-20 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-sm text-gray-400">Loading seller workspace...</p>
      </div>
    );
  }

  if (!isApprovedSeller) {
    return (
      <div className="min-h-screen pt-24 pb-20 bg-background flex flex-col">
        <div className="container mx-auto px-4 max-w-4xl">
          <PendingSellerReview onStatusApproved={() => { refreshUser(); fetchData(); }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-20 bg-background flex flex-col">
      <div className="container mx-auto px-4 flex-1 flex flex-col md:flex-row gap-8">
        
        {/* Sidebar */}
        <aside className="w-full md:w-64 shrink-0">
          <div className="bg-[#141428]/80 backdrop-blur-xl border border-border rounded-xl p-4 sticky top-28">
            <div className="flex items-center gap-3 mb-6 p-2 bg-white/5 rounded-xl border border-white/10">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-lg border border-emerald-500/30 shrink-0 shadow-md">
                {(user?.photoURL && user.photoURL.trim()) || (user?.avatar_url && user.avatar_url.trim()) ? (
                  <img src={user.photoURL || user.avatar_url} alt={user?.name || "Seller Avatar"} className="w-full h-full object-cover" />
                ) : (
                  user?.name?.charAt(0) || "S"
                )}
              </div>
              <div className="overflow-hidden">
                <h3 className="font-display font-bold text-sm text-white truncate">{user?.name || "Seller Portal"}</h3>
                <p className="text-[11px] text-emerald-400 font-mono font-medium">Enterprise Seller</p>
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
                        ? 'bg-emerald-500/20 text-emerald-400 font-medium border border-emerald-500/30' 
                        : 'text-muted-foreground hover:bg-white/[0.05] hover:text-white border border-transparent'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-muted-foreground'}`} />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
            <div className="mt-6 pt-6 border-t border-border space-y-2">
               <Link to="/sell">
                 <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white">Upload Product</Button>
               </Link>

               {/* Message Admin Button - Visible for KYC Approved sellers */}
               {isApprovedSeller ? (
                 <Button
                   onClick={() => setMsgModalOpen(true)}
                   variant="outline"
                   className="w-full border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 text-xs flex items-center justify-center gap-2"
                 >
                   <MessageSquare className="w-3.5 h-3.5 text-indigo-400" /> Message Admin
                 </Button>
               ) : (
                 <div className="text-[10px] text-muted-foreground text-center py-1.5 px-2 bg-white/5 rounded-lg border border-white/5 font-mono">
                   Message Admin available after KYC Approval
                 </div>
               )}

               <Link to="/user/dashboard">
                 <Button
                   variant="outline"
                   className="w-full border-border text-muted-foreground hover:text-white hover:bg-white/5 text-xs flex items-center justify-center gap-2"
                 >
                   <User className="w-3.5 h-3.5" /> User Panel
                 </Button>
               </Link>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <ReverificationCountdownBanner
            reverification={reverification}
            onGoToKyc={() => setActiveTab("kyc")}
          />

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'overview' && (
                <OverviewTab 
                  data={dashboardData} 
                  kycStatus={kycStatus}
                  onGoToKyc={() => setActiveTab("kyc")}
                />
              )}
              {activeTab === 'products' && <ProductsTab data={dashboardData} loading={loading} />}
              {activeTab === 'sales' && <SalesTab data={dashboardData} />}
              {activeTab === 'analytics' && <AnalyticsTab data={dashboardData} />}
              {activeTab === 'wallet' && (
                <WalletTab 
                  data={dashboardData} 
                  token={token} 
                  onRefresh={fetchData} 
                  isApprovedSeller={isApprovedSeller} 
                  onGoToKyc={() => setActiveTab("kyc")} 
                />
              )}
              {activeTab === 'reviews' && <ReviewsTab token={token} />}
              {activeTab === 'customers' && <CustomersTab token={token} />}
              {activeTab === 'coupons' && <CouponsTab token={token} />}
              {activeTab === 'flash-discounts' && <FlashDiscountsTab listings={dashboardData?.myListings || dashboardData?.listings || []} token={token} onRefresh={fetchData} />}
              {activeTab === 'store-settings' && <StoreSettingsTab token={token} />}
              {activeTab === 'kyc' && (
                <KYCTab 
                  kycStatus={kycStatus}
                  onSubmitSuccess={() => { fetchReverificationStatus(); fetchData(); }} 
                  onStatusApproved={() => { refreshUser(); fetchData(); }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <SellerMessageAdminModal
        isOpen={msgModalOpen}
        onClose={() => setMsgModalOpen(false)}
        token={token}
        user={user}
        kycStatus={kycStatus}
      />
    </div>
  );
}

function OverviewTab({ 
  data, 
  kycStatus, 
  onGoToKyc 
}: { 
  data: any; 
  kycStatus: string; 
  onGoToKyc?: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Real KYC Status Banner (Spec 2.1) */}
      {kycStatus === 'verified' || kycStatus === 'approved' ? (
        <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-400" />
            <div>
              <span className="font-bold">Enterprise Verified Merchant</span>
              <p className="text-xs text-emerald-300/80 mt-0.5">Your identity and business credentials are confirmed. Instant payouts and listing promotion active.</p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-xs font-bold uppercase rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Active & Verified
          </span>
        </div>
      ) : kycStatus === 'pending' || kycStatus === 'under_review' ? (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 shrink-0 text-amber-400 animate-pulse" />
            <div>
              <span className="font-bold">KYC Verification Under Review</span>
              <p className="text-xs text-amber-300/80 mt-0.5">Documents submitted. Compliance review currently in progress (estimated SLA: 24–48 hours).</p>
            </div>
          </div>
          {onGoToKyc && (
            <Button size="sm" onClick={onGoToKyc} className="bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs rounded-lg shrink-0">
              View Submission
            </Button>
          )}
        </div>
      ) : kycStatus === 'rejected' ? (
        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <div>
              <span className="font-bold">KYC Verification Action Required</span>
              <p className="text-xs text-rose-300/80 mt-0.5">Your previous document submission was rejected. Please review feedback and resubmit your details.</p>
            </div>
          </div>
          {onGoToKyc && (
            <Button size="sm" onClick={onGoToKyc} className="bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs rounded-lg shrink-0">
              Resubmit KYC
            </Button>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 shrink-0 text-indigo-400" />
            <div>
              <span className="font-bold">Complete KYC Verification</span>
              <p className="text-xs text-indigo-300/80 mt-0.5">Submit your PAN/ID and payout details to unlock instant listing approvals and direct wallet withdrawals.</p>
            </div>
          </div>
          {onGoToKyc && (
            <Button size="sm" onClick={onGoToKyc} className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-lg shrink-0">
              Verify Now
            </Button>
          )}
        </div>
      )}

      <h2 className="text-2xl font-display font-bold">Store Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-[#141428]/80 border-border">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground mb-1">Total Revenue</p>
            <h3 className="text-2xl font-bold text-emerald-400">${data?.sales?.reduce((a:any,b:any) => a + (b.seller_earnings||0), 0)?.toFixed(2) || "0.00"}</h3>
          </CardContent>
        </Card>
        <Card className="bg-[#141428]/80 border-border">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground mb-1">Total Sales</p>
            <h3 className="text-2xl font-bold">{data?.sales?.length || 0}</h3>
          </CardContent>
        </Card>
        <Card className="bg-[#141428]/80 border-border">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground mb-1">Active Products</p>
            <h3 className="text-2xl font-bold">{data?.listings?.length || 0}</h3>
          </CardContent>
        </Card>
        <Card className="bg-[#141428]/80 border-border">
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground mb-1">Wallet Balance</p>
            <h3 className="text-2xl font-bold text-indigo-400">${data?.balance?.toFixed(2) || "0.00"}</h3>
          </CardContent>
        </Card>
      </div>

      {data?.sales && data.sales.length > 0 && (
        <Card className="bg-[#141428]/80 border-border">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-white">Recent Store Orders</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3">Order ID</th>
                    <th className="px-6 py-3">Product</th>
                    <th className="px-6 py-3">Buyer</th>
                    <th className="px-6 py-3">Earnings</th>
                    <th className="px-6 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.sales.slice(0, 5).map((sale: any) => (
                    <tr key={sale.order_id} className="hover:bg-white/[0.02]">
                      <td className="px-6 py-3 font-mono text-xs text-indigo-400">{sale.order_id}</td>
                      <td className="px-6 py-3 font-medium text-white">{sale.title}</td>
                      <td className="px-6 py-3 text-muted-foreground">{sale.buyer_name}</td>
                      <td className="px-6 py-3 text-emerald-400 font-bold">+${(sale.seller_earnings || sale.amount)?.toFixed(2)}</td>
                      <td className="px-6 py-3 text-muted-foreground">{new Date(sale.order_date).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProductsTab({ data, loading }: { data: any, loading?: boolean }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold">Manage Products</h2>
        <Link to="/sell">
          <Button className="bg-emerald-500 hover:bg-emerald-600 font-bold">
            + New Listing
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-white/[0.02] animate-pulse">
              <div className="flex-1 space-y-2">
                <div className="h-5 bg-muted/40 rounded w-1/3"></div>
                <div className="h-4 bg-muted/40 rounded w-1/4"></div>
              </div>
              <div className="h-10 w-24 bg-muted/40 rounded"></div>
            </div>
          ))}
        </div>
      ) : data?.listings?.length === 0 ? (
        <div className="p-8 text-center border border-border rounded-xl bg-white/[0.02]">
          <p className="text-muted-foreground mb-4">You have no products listed.</p>
          <Link to="/sell"><Button className="bg-emerald-500">Create Product</Button></Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {data?.listings?.map((p: any) => {
            const isFlash = p.flash_discount_percentage > 0 && p.flash_discount_ends_at && new Date(p.flash_discount_ends_at).getTime() > Date.now();

            return (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-border bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                <div className="flex items-center gap-3">
                  {p.image_url && p.image_url.trim() ? (
                    <img src={p.image_url} alt={p.title} className="w-12 h-12 rounded-lg object-cover border border-border shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center font-bold text-muted-foreground shrink-0">
                      {p.title?.charAt(0) || "P"}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-white">{p.title}</h4>
                      {isFlash && (
                        <span className="px-2 py-0.5 text-xs font-bold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full flex items-center gap-1">
                          <Zap className="w-3 h-3 fill-amber-300" />
                          {p.flash_discount_percentage}% OFF Flash Sale
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">Price: ${p.price} • Status: <span className="capitalize">{p.status}</span></p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link to={`/manage/${p.id}`}>
                    <Button variant="outline" className="border-border text-sm">Manage Settings</Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}



function SalesTab({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-display font-bold">Sales & Orders</h2>
      {data?.sales?.length === 0 ? (
        <div className="p-8 text-center border border-border rounded-xl bg-white/[0.02]">
          <p className="text-muted-foreground">You haven't made any sales yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-[#141428]/80 backdrop-blur-xl border border-border rounded-xl">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-6 py-4 rounded-tl-xl">Order ID</th>
                <th className="px-6 py-4">Product</th>
                <th className="px-6 py-4">Buyer</th>
                <th className="px-6 py-4">Earnings</th>
                <th className="px-6 py-4 rounded-tr-xl">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data?.sales?.map((sale: any) => (
                <tr key={sale.order_id} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-4 font-mono text-xs">{sale.order_id}</td>
                  <td className="px-6 py-4 font-medium">{sale.title}</td>
                  <td className="px-6 py-4">{sale.buyer_name}</td>
                  <td className="px-6 py-4 text-emerald-400 font-bold">+${(sale.seller_earnings || sale.amount)?.toFixed(2)}</td>
                  <td className="px-6 py-4">{new Date(sale.order_date).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AnalyticsTab({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-display font-bold">Store Analytics</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#141428]/80 border-border">
          <CardHeader>
            <CardTitle>Conversion Rate</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-48">
            <div className="text-center">
              <h3 className="text-5xl font-bold text-indigo-400 mb-2">{data?.sales?.length && data?.myListings?.length ? Math.min((data.sales.length / (data.myListings.length * 10)) * 100, 100).toFixed(1) : "0.0"}%</h3>
              <p className="text-sm text-muted-foreground">From Store Views to Purchases</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#141428]/80 border-border">
          <CardHeader>
            <CardTitle>Top Performing Product</CardTitle>
          </CardHeader>
          <CardContent className="h-48 flex items-center justify-center">
             {data?.sales?.length > 0 ? (
                <div className="text-center">
                  <h3 className="text-xl font-bold text-emerald-400 mb-2">{data.sales[0].title}</h3>
                  <p className="text-sm text-muted-foreground">Most sales this month</p>
                </div>
             ) : (
                <p className="text-muted-foreground">Not enough data</p>
             )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function WalletTab({ 
  data, 
  token, 
  onRefresh,
  isApprovedSeller = true,
  onGoToKyc
}: { 
  data: any; 
  token?: string; 
  onRefresh?: () => void;
  isApprovedSeller?: boolean;
  onGoToKyc?: () => void;
}) {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeMethod, setActiveMethod] = useState<'upi' | 'bank'>('upi');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'pending' | 'completed' | 'failed' | 'on_hold'>('all');

  // Form Fields
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [upiId, setUpiId] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [ifscLoading, setIfscLoading] = useState(false);
  const [detectedBank, setDetectedBank] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(true);

  const fetchSummary = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/seller/payout/summary", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setSummary(json);
        // Pre-fill if saved
        if (json.saved_method) {
          const sm = json.saved_method;
          if (sm.method_type === 'upi' && sm.upi_id) {
            setUpiId(sm.upi_id);
            setActiveMethod('upi');
          } else if (sm.method_type === 'bank' && sm.account_number) {
            setAccountHolder(sm.account_holder || '');
            setAccountNumber(sm.account_number || '');
            setConfirmAccountNumber(sm.account_number || '');
            setIfscCode(sm.ifsc_code || '');
            setBankName(sm.bank_name || '');
            setDetectedBank(sm.bank_name || '');
            setActiveMethod('bank');
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load payout summary:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [token]);

  const handleIfscChange = async (val: string) => {
    const clean = val.toUpperCase().trim();
    setIfscCode(clean);
    if (clean.length === 11) {
      setIfscLoading(true);
      try {
        const res = await fetch(`/api/seller/payout/ifsc-lookup/${clean}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const json = await res.json();
          if (json.valid && json.bank_name) {
            setDetectedBank(json.bank_name);
            if (!bankName) setBankName(json.bank_name);
          }
        }
      } catch (e) {
        console.warn("IFSC lookup failed:", e);
      } finally {
        setIfscLoading(false);
      }
    } else {
      setDetectedBank("");
    }
  };

  const financials = summary?.financials || {
    gross_sales: 0,
    sales_count: 0,
    platform_commission: 0,
    commission_percentage: '25%',
    refund_reserve_amount: 0,
    refund_reserve_percentage: '0%',
    net_earnings: 0,
    available_balance: data?.balance || 0,
    pending_payout_amount: 0,
    completed_payout_amount: 0,
    min_payout_threshold: 25.0,
    payout_sla_hours: 72
  };

  const availableBal = Number(financials.available_balance || 0);
  const minThreshold = Number(financials.min_payout_threshold || 25.0);
  const requestedNum = parseFloat(withdrawAmount) || 0;

  // Validation Flags
  const isAmountValid = requestedNum > 0 && requestedNum >= minThreshold && requestedNum <= availableBal;
  const isUpiValid = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/.test(upiId.trim());
  const isBankValid = 
    accountHolder.trim().length >= 2 && 
    accountNumber.trim().length >= 8 && 
    accountNumber.trim() === confirmAccountNumber.trim() && 
    /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.trim());

  const canSubmit = isAmountValid && (activeMethod === 'upi' ? isUpiValid : isBankValid) && !submitting;

  const handleSubmitPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (requestedNum < minThreshold) {
      toast.error(`Minimum withdrawal amount is $${minThreshold.toFixed(2)}`);
      return;
    }
    if (requestedNum > availableBal) {
      toast.error(`Amount exceeds your available balance of $${availableBal.toFixed(2)}`);
      return;
    }

    if (activeMethod === 'upi') {
      if (!isUpiValid) {
        toast.error("Please enter a valid UPI ID (e.g. name@okhdfcbank)");
        return;
      }
    } else {
      if (!accountHolder.trim()) {
        toast.error("Account holder name is required");
        return;
      }
      if (accountNumber.trim().length < 8) {
        toast.error("Account number must be at least 8 digits");
        return;
      }
      if (accountNumber.trim() !== confirmAccountNumber.trim()) {
        toast.error("Account numbers do not match");
        return;
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.trim())) {
        toast.error("Invalid 11-digit IFSC code (e.g. HDFC0001234)");
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: any = {
        amount: requestedNum,
        method_type: activeMethod,
        save_as_default: saveAsDefault
      };

      if (activeMethod === 'upi') {
        payload.upi_id = upiId.trim();
      } else {
        payload.account_holder = accountHolder.trim();
        payload.account_number = accountNumber.trim();
        payload.ifsc_code = ifscCode.trim().toUpperCase();
        payload.bank_name = bankName.trim() || detectedBank || 'Bank Account';
      }

      const res = await fetch("/api/seller/payout/request", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Payout request failed");

      toast.success(`Payout of $${requestedNum.toFixed(2)} submitted successfully! Status: PENDING (Est. 72h).`);
      setWithdrawAmount("");
      fetchSummary();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit payout request");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPayouts = (summary?.recent_payouts || []).filter((p: any) => {
    if (historyFilter === 'all') return true;
    if (historyFilter === 'pending') return p.status === 'pending' || p.status === 'processing';
    return p.status === historyFilter;
  });

  const latestPending = summary?.latest_pending_payout;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header with Title and Live Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-border/50">
        <div>
          <h2 className="text-2xl font-display font-bold text-white tracking-wide flex items-center gap-2.5">
            <Wallet className="w-6 h-6 text-emerald-400" />
            Wallet & Earnings Command
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live commission-adjusted earnings, atomic payout disbursements, and real-time bank status
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchSummary}
          disabled={loading}
          className="gap-2 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Financials
        </Button>
      </div>

      {/* 1. REAL EARNINGS BREAKDOWN CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Available Balance (Primary CTA Card) */}
        <Card className="bg-gradient-to-br from-[#121b2d] to-[#141428] border-emerald-500/30 shadow-lg shadow-emerald-950/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between text-xs text-emerald-400 font-medium">
              <span>AVAILABLE BALANCE</span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>
            <CardTitle className="text-3xl font-bold text-emerald-400 tracking-tight">
              ${availableBal.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground pt-0">
            <p className="flex items-center gap-1.5 text-emerald-300/80 font-medium">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              Withdrawable instantly
            </p>
            <p className="mt-1 text-gray-400 text-[11px]">
              Min withdrawal threshold: ${minThreshold.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        {/* Gross Sales */}
        <Card className="bg-[#141428]/80 border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground font-medium">TOTAL GROSS SALES</div>
            <CardTitle className="text-2xl font-bold text-white">
              ${Number(financials.gross_sales || 0).toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground pt-0">
            <p className="flex items-center justify-between">
              <span>Completed Orders:</span>
              <span className="font-semibold text-white">{financials.sales_count || 0}</span>
            </p>
            <p className="text-[11px] text-gray-500 mt-1">Direct product sales volume</p>
          </CardContent>
        </Card>

        {/* Platform Deductions & Net */}
        <Card className="bg-[#141428]/80 border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground font-medium">PLATFORM COMMISSION</div>
            <CardTitle className="text-2xl font-bold text-amber-400">
              -${Number(financials.platform_commission || 0).toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground pt-0 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span>Commission Rate:</span>
              <span className="text-gray-300">{financials.commission_percentage || '25%'}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span>Effective Rate:</span>
              <span className="text-gray-300">Standard Tier</span>
            </div>
          </CardContent>
        </Card>

        {/* Net Settled / In Pipeline */}
        <Card className="bg-[#141428]/80 border-border">
          <CardHeader className="pb-2">
            <div className="text-xs text-muted-foreground font-medium">PAYOUT PIPELINE</div>
            <CardTitle className="text-2xl font-bold text-indigo-400">
              ${Number(financials.pending_payout_amount || 0).toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground pt-0">
            <p className="flex items-center justify-between">
              <span>Past Disbursed:</span>
              <span className="font-semibold text-white">${Number(financials.completed_payout_amount || 0).toFixed(2)}</span>
            </p>
            <p className="text-[11px] text-indigo-300/80 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Standard SLA: {financials.payout_sla_hours} hours
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 2. REAL-TIME PENDING PAYOUT TRACKER ALERT */}
      {latestPending && (
        <div className="bg-gradient-to-r from-amber-500/15 via-indigo-500/10 to-[#141428] border border-amber-500/30 rounded-xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <Clock className="w-5 h-5 text-amber-400 animate-pulse" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider">
                    {latestPending.status === 'processing' ? 'In Processing' : latestPending.status === 'on_hold' ? 'On Hold' : 'Payout Pending'}
                  </span>
                  <span className="text-xs text-gray-400">ID: {latestPending.id.substring(0, 12)}...</span>
                  <span className="text-xs text-gray-400">• Requested: {new Date(latestPending.created_at).toLocaleDateString()}</span>
                </div>
                <h4 className="text-lg font-bold text-white mt-1">
                  Withdrawal of ${Number(latestPending.amount).toFixed(2)} is being processed
                </h4>
                <p className="text-xs text-gray-300 mt-0.5">
                  Destination: <span className="font-mono text-amber-200 font-medium">{latestPending.masked_details || latestPending.method_type}</span>
                </p>
              </div>
            </div>
            <div className="bg-black/30 border border-border/50 rounded-lg p-3 text-right shrink-0 sm:max-w-xs">
              <p className="text-xs text-gray-300 font-medium flex items-center gap-1.5 justify-end">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Protected by SLA Guarantee
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Payouts are typically processed within 72 hours. You'll be notified automatically once disbursed.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. REQUEST PAYOUT FORM & SAVED METHOD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Payout Request Card (7 cols) */}
        <Card className="bg-[#141428]/80 border-border lg:col-span-7 shadow-xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                Request Payout Withdrawal
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                Available: <strong className="text-emerald-400">${availableBal.toFixed(2)}</strong>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitPayout} className="space-y-5">
              {/* STEP 1: Method Selector */}
              <div>
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider block mb-2">
                  1. Select Payout Method
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveMethod('upi')}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                      activeMethod === 'upi'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md shadow-indigo-950/30 ring-1 ring-indigo-500/50'
                        : 'bg-muted/40 border-border/70 text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    <Smartphone className={`w-5 h-5 ${activeMethod === 'upi' ? 'text-indigo-400' : 'text-gray-400'}`} />
                    <div>
                      <div className="font-semibold text-sm">UPI Transfer</div>
                      <div className="text-[11px] text-gray-400">Instant to GooglePay, PhonePe, Paytm</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveMethod('bank')}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                      activeMethod === 'bank'
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md shadow-indigo-950/30 ring-1 ring-indigo-500/50'
                        : 'bg-muted/40 border-border/70 text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    <Building2 className={`w-5 h-5 ${activeMethod === 'bank' ? 'text-indigo-400' : 'text-gray-400'}`} />
                    <div>
                      <div className="font-semibold text-sm">Bank Transfer</div>
                      <div className="text-[11px] text-gray-400">NEFT / IMPS / RTGS Direct to Account</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* STEP 2: Receiving Details Form */}
              <div className="bg-black/20 border border-border/60 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    2. Enter Receiving Details
                  </label>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Lock className="w-3 h-3 text-emerald-400" />
                    Encrypted & Tokenized
                  </span>
                </div>

                {activeMethod === 'upi' ? (
                  <div className="space-y-2">
                    <label className="text-xs text-gray-300 font-medium">UPI ID (VPA)</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        placeholder="yourname@okhdfcbank or merchant@paytm"
                        className={`w-full bg-muted/70 border rounded-lg h-10 px-3 text-sm text-white focus:outline-none focus:ring-2 ${
                          upiId && isUpiValid
                            ? 'border-emerald-500/50 focus:ring-emerald-500/30'
                            : upiId && !isUpiValid
                            ? 'border-rose-500/60 focus:ring-rose-500/30'
                            : 'border-border focus:ring-indigo-500/30'
                        }`}
                      />
                      {upiId && isUpiValid && (
                        <Check className="w-4 h-4 text-emerald-400 absolute right-3 top-3" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Pattern: <code className="text-indigo-300 font-mono">username@bankhandle</code> (e.g. paytm, oksbi, okhdfcbank, okaxis, upi)
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-300 font-medium">Account Holder Legal Name</label>
                      <input
                        type="text"
                        value={accountHolder}
                        onChange={(e) => setAccountHolder(e.target.value)}
                        placeholder="Full Name as per Bank Records"
                        className="w-full bg-muted/70 border border-border rounded-lg h-10 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 mt-1"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-300 font-medium">Account Number</label>
                        <input
                          type="password"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          placeholder="8 to 18 digit account number"
                          className="w-full bg-muted/70 border border-border rounded-lg h-10 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 mt-1 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-300 font-medium">Confirm Account Number</label>
                        <input
                          type="text"
                          value={confirmAccountNumber}
                          onChange={(e) => setConfirmAccountNumber(e.target.value)}
                          placeholder="Re-enter account number"
                          className={`w-full bg-muted/70 border rounded-lg h-10 px-3 text-sm text-white focus:outline-none focus:ring-2 mt-1 font-mono ${
                            confirmAccountNumber && accountNumber === confirmAccountNumber
                              ? 'border-emerald-500/60 focus:ring-emerald-500/30'
                              : confirmAccountNumber && accountNumber !== confirmAccountNumber
                              ? 'border-rose-500/60 focus:ring-rose-500/30'
                              : 'border-border focus:ring-indigo-500/30'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-gray-300 font-medium">IFSC Code (11 Digits)</label>
                          {ifscLoading && <span className="text-[10px] text-indigo-400 animate-pulse">Checking IFSC...</span>}
                        </div>
                        <input
                          type="text"
                          value={ifscCode}
                          maxLength={11}
                          onChange={(e) => handleIfscChange(e.target.value)}
                          placeholder="e.g. HDFC0001234, SBIN0000456"
                          className="w-full bg-muted/70 border border-border rounded-lg h-10 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 mt-1 uppercase font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-300 font-medium">Bank Name</label>
                        <input
                          type="text"
                          value={bankName || detectedBank}
                          onChange={(e) => setBankName(e.target.value)}
                          placeholder="Auto-detected or enter name"
                          className="w-full bg-muted/70 border border-border rounded-lg h-10 px-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 mt-1"
                        />
                      </div>
                    </div>

                    {detectedBank && (
                      <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2 text-xs text-emerald-300">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Verified Bank Institution: <strong>{detectedBank}</strong></span>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-300 select-none">
                    <input
                      type="checkbox"
                      checked={saveAsDefault}
                      onChange={(e) => setSaveAsDefault(e.target.checked)}
                      className="rounded border-gray-700 bg-muted text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Save and set as my default receiving payout destination</span>
                  </label>
                </div>
              </div>

              {/* STEP 3: Withdrawal Amount */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    3. Withdrawal Amount (USD / INR)
                  </label>
                  <span className="text-xs text-gray-400">
                    Min: <strong className="text-white">${minThreshold.toFixed(2)}</strong>
                  </span>
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 font-bold">
                    $
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min={minThreshold}
                    max={availableBal}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder={`Enter amount (min $${minThreshold.toFixed(2)})`}
                    className={`w-full bg-muted/70 border rounded-lg h-12 pl-8 pr-20 text-lg font-bold text-white focus:outline-none focus:ring-2 ${
                      withdrawAmount && !isAmountValid
                        ? 'border-rose-500/60 focus:ring-rose-500/30'
                        : withdrawAmount && isAmountValid
                        ? 'border-emerald-500/50 focus:ring-emerald-500/30'
                        : 'border-border focus:ring-indigo-500/30'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setWithdrawAmount(availableBal > 0 ? availableBal.toString() : '0')}
                    className="absolute right-2 top-2 px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 text-xs font-bold rounded-md transition"
                  >
                    MAX
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {[25, 50, 100, 250, 500].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={preset > availableBal}
                      onClick={() => setWithdrawAmount(preset.toString())}
                      className={`px-3 py-1 rounded-md text-xs font-medium border transition ${
                        requestedNum === preset
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : preset <= availableBal
                          ? 'bg-muted/40 border-border/60 text-gray-300 hover:bg-muted'
                          : 'bg-muted/20 border-border/30 text-gray-600 cursor-not-allowed'
                      }`}
                    >
                      ${preset}
                    </button>
                  ))}
                </div>

                {/* Error / Validation Feedback */}
                {withdrawAmount && requestedNum > availableBal && (
                  <p className="text-xs text-rose-400 mt-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Amount exceeds your available balance of ${availableBal.toFixed(2)}
                  </p>
                )}
                {withdrawAmount && requestedNum > 0 && requestedNum < minThreshold && (
                  <p className="text-xs text-amber-400 mt-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    Minimum withdrawal is ${minThreshold.toFixed(2)}
                  </p>
                )}
              </div>

              {/* STEP 4: Submit Button (Spec 2.6 KYC Gate) */}
              <Button
                type="submit"
                disabled={!isApprovedSeller || !canSubmit}
                className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-950/40 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {!isApprovedSeller ? (
                  <span className="flex items-center gap-2 text-amber-300">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    KYC Approval Required to Request Payouts
                  </span>
                ) : submitting ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Reserving Funds & Submitting Payout...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4" />
                    Submit Payout Request (${requestedNum > 0 ? requestedNum.toFixed(2) : '0.00'})
                  </span>
                )}
              </Button>
              {!isApprovedSeller && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between text-xs text-amber-300 mt-2">
                  <span>Merchant KYC verification is required to withdraw wallet funds.</span>
                  {onGoToKyc && (
                    <button type="button" onClick={onGoToKyc} className="underline font-semibold hover:text-amber-200">
                      Complete KYC →
                    </button>
                  )}
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Payout Security & Default Destination Details (5 cols) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Saved / Current Payout Destination */}
          <Card className="bg-[#141428]/80 border-border shadow-xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-400" />
                Active Payout Destination
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              {summary?.saved_method?.masked_summary ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-300 uppercase tracking-wider text-[11px]">
                      {summary.saved_method.method_type === 'upi' ? 'UPI Linked' : 'Bank Account Linked'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                      VERIFIED
                    </span>
                  </div>
                  <div className="font-mono text-sm text-white font-bold">
                    {summary.saved_method.masked_summary}
                  </div>
                  {summary.saved_method.account_holder && (
                    <div className="text-emerald-200/80 text-[11px]">
                      Holder: {summary.saved_method.account_holder}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl">
                  <p className="text-amber-200 font-medium">No default payout method saved</p>
                  <p className="text-amber-300/70 text-[11px] mt-1">
                    Fill out the payout form and check "Save as default" to store your bank or UPI details.
                  </p>
                </div>
              )}

              {/* Disbursement Protocol Info */}
              <div className="border-t border-border/60 pt-3 space-y-2 text-muted-foreground text-[11px]">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Zero-Risk Atomic Ledger:</strong> Funds are locked upon request. If a payout is rejected, funds are immediately restored to your balance.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Processing SLA:</strong> Admin reviews and initiates transfers within 72 hours via Razorpay / Bank NEFT.
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Anti-Fraud Shield:</strong> Automated compliance checks protect your earnings from unauthorized withdrawals.
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick SLA Banner */}
          <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-4 text-xs text-indigo-200/80 space-y-1">
            <h5 className="font-bold text-white flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-indigo-400" />
              Need to expedite a payout?
            </h5>
            <p className="text-[11px] text-gray-300">
              For priority disbursements above $1,000.00, contact our dedicated Seller Operations support desk via the messages portal.
            </p>
          </div>
        </div>
      </div>

      {/* 4. PAYOUT DISBURSEMENT HISTORY TABLE */}
      <Card className="bg-[#141428]/80 border-border shadow-xl">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold text-white flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-400" />
                Payout Disbursement History
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Audit trail of all requested, pending, and settled disbursements
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 bg-black/30 p-1 rounded-lg border border-border/50">
              {(['all', 'pending', 'completed', 'failed', 'on_hold'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setHistoryFilter(filter)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition ${
                    historyFilter === filter
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {filter === 'failed' ? 'Rejected' : filter === 'on_hold' ? 'On Hold' : filter}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredPayouts.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <History className="w-8 h-8 mx-auto mb-2 text-gray-600 opacity-50" />
              <p>No payout requests match the selected filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/60 text-gray-400 uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3">Request ID</th>
                    <th className="py-3 px-3">Date & Time</th>
                    <th className="py-3 px-3">Amount</th>
                    <th className="py-3 px-3">Method / Destination</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Processed / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-sans">
                  {filteredPayouts.map((p: any) => {
                    const isPending = p.status === 'pending' || p.status === 'processing';
                    const isCompleted = p.status === 'completed';
                    const isFailed = p.status === 'failed' || p.status === 'rejected';
                    const isOnHold = p.status === 'on_hold';

                    return (
                      <tr key={p.id} className="hover:bg-white/[0.02] transition">
                        <td className="py-3 px-3 font-mono text-gray-300">
                          {p.id.substring(0, 10)}...
                        </td>
                        <td className="py-3 px-3 text-gray-300">
                          {new Date(p.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 font-bold text-sm text-white">
                          ${Number(p.amount).toFixed(2)}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-mono text-indigo-300 bg-indigo-950/40 px-2 py-1 rounded border border-indigo-800/40 text-[11px]">
                            {p.masked_details || p.method_type || 'Bank/UPI'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {isPending && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                              Pending (SLA ~72h)
                            </span>
                          )}
                          {isCompleted && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle className="w-3 h-3 text-emerald-400" />
                              Completed / Disbursed
                            </span>
                          )}
                          {isFailed && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              <AlertCircle className="w-3 h-3 text-rose-400" />
                              Rejected & Restored
                            </span>
                          )}
                          {isOnHold && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                              <Clock className="w-3 h-3 text-orange-400" />
                              Under Review
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-gray-400 text-[11px] max-w-xs truncate">
                          {p.admin_notes ? (
                            <span className={isFailed ? 'text-rose-300' : 'text-gray-300'}>
                              {p.admin_notes}
                            </span>
                          ) : p.processed_at ? (
                            <span>Processed on {new Date(p.processed_at).toLocaleDateString()}</span>
                          ) : (
                            <span className="text-gray-500">In verification queue</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CouponsTab({ token }: { token?: string }) {
  const [coupons, setCoupons] = useState<any[]>([]);
  
  useEffect(() => {
    if(token) {
      fetch('/api/seller/coupons', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => safeJson(res, { coupons: [] }))
      .then(data => setCoupons(data.coupons || [])).catch(e => console.warn(e));
    }
  }, [token]);
  
  const createCoupon = async () => {
    try {
      const res = await fetch('/api/seller/coupons', {
         method: 'POST',
         headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
         body: JSON.stringify({ code: 'PROMO' + Math.floor(Math.random()*1000), discount_percentage: 10, valid_until: new Date(Date.now() + 30*24*60*60*1000) })
      });
      const data = await safeJson(res);
      if(data.success) {
         toast.success("Coupon created!");
         setCoupons([...coupons, data.coupon]);
      } else {
         toast.error(data.error);
      }
    } catch(err: any) { toast.error(err.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-display font-bold">Marketing & Coupons</h2>
        <Button className="bg-emerald-500 hover:bg-emerald-600" onClick={createCoupon}>Create Coupon</Button>
      </div>
      {coupons.length === 0 ? (
      <div className="p-8 text-center border border-border rounded-xl bg-white/[0.02]">
        <p className="text-muted-foreground mb-4">You haven't created any promotional campaigns.</p>
      </div>
  ) : (
      <div className="grid gap-4">
        {coupons.map((c: any) => (
           <div key={c.id} className="p-4 bg-white/[0.02] border border-border rounded-xl flex justify-between items-center">
              <div>
                 <p className="font-bold text-emerald-400">{c.code}</p>
                 <p className="text-xs text-muted-foreground">{c.discount_percentage}% off</p>
              </div>
           </div>
        ))}
      </div>
  )}
    </div>
  );
}

function StoreSettingsTab({ token }: { token?: string }) {
  const { user, refreshUser } = useAuth();
  const [storeName, setStoreName] = useState(user?.name || "My Premium Store");
  const [storeDesc, setStoreDesc] = useState("High quality digital assets and premium software.");
  const [supportEmail, setSupportEmail] = useState(user?.email || "support@mystore.com");
  const [saving, setSaving] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [processedImage, setProcessedImage] = useState<ProcessedImageResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRemovePhoto, setIsRemovePhoto] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.name) setStoreName(user.name);
    if (user?.email) setSupportEmail(user.email);
    if (token) {
      fetch('/api/seller/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => safeJson(res))
      .then(data => {
         if(data.settings) {
            if (data.settings.storeName) setStoreName(data.settings.storeName);
            if (data.settings.storeDesc) setStoreDesc(data.settings.storeDesc);
            if (data.settings.supportEmail) setSupportEmail(data.settings.supportEmail);
         }
      }).catch(e => console.warn(e));
    }
  }, [token, user]);

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
    toast.success("Seller avatar cropped & processed!");
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

  const saveSettings = async () => {
    if (!storeName.trim()) {
      toast.error("Store name cannot be empty.");
      return;
    }

    setSaving(true);
    try {
      await updateUniversalProfile({
        uid: user?.id,
        displayName: storeName,
        file: selectedFile,
        processedImage,
        isRemovePhoto,
        role: "seller",
        token
      });

      await fetch('/api/seller/settings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeName, storeDesc, supportEmail })
      });

      await refreshUser();
      setSelectedFile(null);
      setProcessedImage(null);
      setPreviewUrl(null);
      setIsRemovePhoto(false);
      toast.success("Seller profile & avatar updated in Firebase Storage & Firestore!");
    } catch(err: any) { 
      toast.error(err.message || "Error saving seller settings"); 
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <Store className="w-6 h-6 text-emerald-400" />
            Seller Profile & Store Settings
          </h2>
          <p className="text-xs text-muted-foreground mt-1">Manage seller branding, display avatar, and support metadata stored in Cloud Firestore.</p>
        </div>
      </div>

      <Card className="bg-[#141428]/80 border-border">
        <CardContent className="p-6 space-y-6">
          
          {/* Seller Avatar Control */}
          <div className="flex flex-col sm:flex-row items-center gap-6 p-4 bg-white/5 rounded-xl border border-white/10">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-3xl border-2 border-emerald-400/50 shadow-xl">
                {currentAvatar && currentAvatar.trim() ? (
                  <img src={currentAvatar} alt={storeName || "Seller Avatar"} className="w-full h-full object-cover" />
                ) : (
                  storeName?.charAt(0)?.toUpperCase() || "S"
                )}
              </div>
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2 rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-500 transition-all"
                title="Upload New Seller Avatar"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 text-center sm:text-left space-y-2">
              <h4 className="font-semibold text-white text-base">Seller Profile Picture</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Formats: <span className="text-emerald-300 font-mono font-bold">PNG, JPG, JPEG</span> (Max size: <span className="text-emerald-300 font-mono font-bold">5MB</span>). Saved to Firebase Cloud Storage.
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
                  className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20 text-xs gap-1.5"
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
            <label className="text-sm font-medium mb-1 block text-gray-300">Seller / Store Display Name</label>
            <input type="text" value={storeName} onChange={(e)=>setStoreName(e.target.value)} className="w-full bg-background border border-border text-white rounded-md h-10 px-3" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block text-gray-300">Store Description</label>
            <textarea value={storeDesc} onChange={(e)=>setStoreDesc(e.target.value)} className="w-full min-h-[100px] bg-background border border-border text-white rounded-md p-3" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block text-gray-300">Support Email</label>
            <input type="email" value={supportEmail} onChange={(e)=>setSupportEmail(e.target.value)} className="w-full bg-background border border-border text-white rounded-md h-10 px-3" />
          </div>

          <Button className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2.5 px-6" onClick={saveSettings} disabled={saving}>
            {saving ? "Uploading & Persisting..." : "Save Seller Profile"}
          </Button>

          <ImageCropModal
            isOpen={isCropOpen}
            file={cropFile}
            onClose={() => setIsCropOpen(false)}
            onCropComplete={handleCropComplete}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function KYCTab({ 
  kycStatus, 
  onSubmitSuccess, 
  onStatusApproved 
}: { 
  kycStatus?: string; 
  onSubmitSuccess?: () => void; 
  onStatusApproved?: () => void; 
}) {
  return (
    <div className="space-y-6">
      {kycStatus === 'pending' || kycStatus === 'under_review' ? (
        <PendingSellerReview onStatusApproved={onStatusApproved} />
      ) : kycStatus === 'verified' || kycStatus === 'approved' ? (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  KYC Verified & Approved
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-mono font-bold border border-emerald-500/30">
                    ACTIVE
                  </span>
                </h3>
                <p className="text-sm text-emerald-300/80 mt-1">
                  Your identity documents and business credentials have been verified by compliance. Instant payout requests, verified merchant badge, and unlimited listing uploads are fully enabled.
                </p>
              </div>
            </div>
          </div>
          <KYCVerificationForm onSubmitSuccess={onSubmitSuccess} />
        </div>
      ) : (
        <KYCVerificationForm onSubmitSuccess={onSubmitSuccess} />
      )}
    </div>
  );
}

function ReviewsTab({ token }: { token?: string }) {
  const [reviews, setReviews] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);

  const fetchReviews = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/seller/reviews", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews || []);
        setStats(data.stats || null);
      }
    } catch (e) {
      console.warn("Failed to fetch seller reviews:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [token]);

  const handleSendReply = async (reviewId: string) => {
    if (!token || !replyText.trim()) return;
    setSubmittingReply(true);
    try {
      const res = await fetch(`/api/seller/reviews/${reviewId}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reply: replyText.trim() })
      });
      if (res.ok) {
        toast.success("Reply posted to customer review!");
        setReplyingTo(null);
        setReplyText("");
        fetchReviews();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to post reply");
      }
    } catch (e) {
      toast.error("Network error while submitting reply");
    } finally {
      setSubmittingReply(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">Product Reviews</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Customer feedback and ratings for your digital assets</p>
        </div>
        {stats && (
          <div className="flex items-center gap-3 bg-[#141428]/80 border border-border px-4 py-2 rounded-xl">
            <div className="flex items-center gap-1.5 text-amber-400">
              <Star className="w-5 h-5 fill-amber-400" />
              <span className="text-xl font-bold text-white">{stats.averageRating || "0.0"}</span>
            </div>
            <span className="text-xs text-muted-foreground font-mono">({stats.totalReviews || 0} reviews)</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-sm text-gray-400">Loading reviews...</p>
        </div>
      ) : reviews.length === 0 ? (
        <Card className="bg-[#141428]/80 border-border p-12 text-center">
          <Star className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-white">No Reviews Received Yet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Reviews from verified purchasers will appear here automatically. You can respond directly to customer feedback.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((rev) => (
            <Card key={rev.id} className="bg-[#141428]/80 border-border">
              <CardContent className="p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {rev.user_name?.charAt(0) || "U"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">{rev.user_name || "Verified Customer"}</span>
                        {rev.verified_purchase !== false && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Verified Purchase
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        on product: <b className="text-zinc-200">{rev.product_title || "Digital Asset"}</b>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3.5 h-3.5 ${
                            s <= Number(rev.rating) ? "text-amber-400 fill-amber-400" : "text-zinc-600"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground ml-2">
                      {new Date(rev.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-zinc-200 pl-12">{rev.comment}</p>

                {/* Seller Existing Reply */}
                {rev.seller_reply ? (
                  <div className="ml-12 mt-3 p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" /> Response from Seller
                      </span>
                      {rev.seller_reply_date && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(rev.seller_reply_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-300">{rev.seller_reply}</p>
                  </div>
                ) : (
                  <div className="ml-12 mt-2">
                    {replyingTo === rev.id ? (
                      <div className="space-y-2 p-3 bg-white/5 border border-white/10 rounded-xl">
                        <textarea
                          rows={3}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Write your public reply to this customer..."
                          className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setReplyingTo(null); setReplyText(""); }}
                            className="text-xs text-muted-foreground hover:text-white"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={!replyText.trim() || submittingReply}
                            onClick={() => handleSendReply(rev.id)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                          >
                            {submittingReply ? "Posting..." : "Post Reply"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setReplyingTo(rev.id); setReplyText(""); }}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1.5 transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Reply to Customer
                      </button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomersTab({ token }: { token?: string }) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!token) return;
    const fetchCustomers = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/seller/customers", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCustomers(data.customers || []);
        }
      } catch (e) {
        console.warn("Failed to fetch seller customers:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchCustomers();
  }, [token]);

  const filtered = customers.filter(
    (c) =>
      c.buyer_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.buyer_email?.toLowerCase().includes(search.toLowerCase())
  );

  const totalSpentAll = customers.reduce((sum, c) => sum + (c.total_spent || 0), 0);
  const totalOrdersAll = customers.reduce((sum, c) => sum + (c.total_orders || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold text-white">Customer Insights</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Buyers who purchased your products and assets</p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by customer name or email..."
          className="bg-[#141428]/80 border border-border rounded-xl px-4 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500 w-full sm:w-72"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-[#141428]/80 border-border">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Unique Buyers</p>
            <h3 className="text-2xl font-bold text-white mt-1">{customers.length}</h3>
          </CardContent>
        </Card>
        <Card className="bg-[#141428]/80 border-border">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Orders Placed</p>
            <h3 className="text-2xl font-bold text-indigo-400 mt-1">{totalOrdersAll}</h3>
          </CardContent>
        </Card>
        <Card className="bg-[#141428]/80 border-border">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Gross Customer Spend</p>
            <h3 className="text-2xl font-bold text-emerald-400 mt-1">${totalSpentAll.toFixed(2)}</h3>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-3"></div>
          <p className="text-sm text-gray-400">Loading customer roster...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-[#141428]/80 border-border p-12 text-center">
          <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-white">No Customers Found</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            {search ? "No customers match your search query." : "When buyers purchase your digital products, their profile and order frequency will be cataloged here."}
          </p>
        </Card>
      ) : (
        <Card className="bg-[#141428]/80 border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-6 py-3">Customer</th>
                    <th className="px-6 py-3">Email</th>
                    <th className="px-6 py-3">Orders</th>
                    <th className="px-6 py-3">Total Spend</th>
                    <th className="px-6 py-3">Last Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filtered.map((c, i) => (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="px-6 py-4 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-300 font-bold flex items-center justify-center text-xs border border-emerald-500/30">
                          {c.buyer_name?.charAt(0) || "C"}
                        </div>
                        <span className="font-medium text-white">{c.buyer_name || "Anonymous Customer"}</span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground font-mono text-xs">{c.buyer_email || "N/A"}</td>
                      <td className="px-6 py-4 font-bold text-indigo-400">{c.total_orders}</td>
                      <td className="px-6 py-4 font-bold text-emerald-400">${(c.total_spent || 0).toFixed(2)}</td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">
                        {c.last_order_date ? new Date(c.last_order_date).toLocaleDateString() : "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FlashDiscountsTab({
  listings,
  token,
  onRefresh
}: {
  listings: any[];
  token?: string;
  onRefresh?: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  const handleOpenForProduct = (product: any) => {
    setSelectedProduct(product);
    setModalOpen(true);
  };

  const handleOpenNew = () => {
    setSelectedProduct(null);
    setModalOpen(true);
  };

  const handleStopFlashSale = async (listingId: string) => {
    try {
      const authToken = token || localStorage.getItem("aurevyxon_token");
      const res = await fetch(`/api/seller/flash-discount/${listingId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Flash discount stopped successfully.");
        if (onRefresh) onRefresh();
      } else {
        toast.error(data.error || "Failed to stop flash discount.");
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred.");
    }
  };

  const activeFlashListings = listings?.filter(
    (l) =>
      l.flash_discount_percentage > 0 &&
      l.flash_discount_ends_at &&
      new Date(l.flash_discount_ends_at).getTime() > Date.now()
  ) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 p-6 rounded-2xl border border-amber-500/30">
        <div>
          <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <Zap className="w-6 h-6 fill-amber-400 text-amber-400 animate-pulse" />
            Flash Discounts & Live Countdown Timers
          </h2>
          <p className="text-sm text-amber-200/80 mt-1">
            Set exact days, hours, minutes, and seconds for limited-time product discounts. The discount automatically expires when the timer hits zero.
          </p>
        </div>
        <Button
          onClick={handleOpenNew}
          className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-bold flex items-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.3)] cursor-pointer"
        >
          <Zap className="w-4 h-4 fill-black" />
          ⚡ Set Flash Sale Timer
        </Button>
      </div>

      {/* Active Flash Sales Grid */}
      {activeFlashListings.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400 font-mono flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Active Flash Sales ({activeFlashListings.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeFlashListings.map((p) => (
              <div
                key={p.id}
                className="bg-zinc-950/90 border border-amber-500/40 rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="overflow-hidden">
                    <h4 className="font-bold text-white text-base truncate">{p.title}</h4>
                    <p className="text-xs text-zinc-400">
                      Original: <span className="line-through">${p.price}</span> | Flash Sale:{" "}
                      <span className="text-emerald-400 font-bold font-mono">
                        ${(p.price * (1 - p.flash_discount_percentage / 100)).toFixed(2)}
                      </span>
                    </p>
                  </div>
                  <span className="px-2.5 py-1 text-xs font-bold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg shrink-0">
                    {p.flash_discount_percentage}% OFF
                  </span>
                </div>

                <FlashSaleTimer
                  endsAt={p.flash_discount_ends_at}
                  discountPercentage={p.flash_discount_percentage}
                  onExpire={() => onRefresh && onRefresh()}
                />

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenForProduct(p)}
                    className="h-8 text-xs border-amber-500/30 text-amber-300 hover:bg-amber-500/10 cursor-pointer"
                  >
                    Edit Timer
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleStopFlashSale(p.id)}
                    className="h-8 text-xs cursor-pointer"
                  >
                    Stop Sale
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Products Flash Sale Status List */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider font-mono">
          Your Store Products ({listings?.length || 0})
        </h3>
        {!listings || listings.length === 0 ? (
          <div className="p-8 text-center border border-border rounded-xl bg-white/[0.02]">
            <p className="text-muted-foreground mb-4">You have no products available for flash sales.</p>
            <Link to="/sell">
              <Button className="bg-emerald-500">Create Product First</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {listings.map((p: any) => {
              const isFlash =
                p.flash_discount_percentage > 0 &&
                p.flash_discount_ends_at &&
                new Date(p.flash_discount_ends_at).getTime() > Date.now();

              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-950/50 hover:bg-zinc-900/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {p.image_url && p.image_url.trim() ? (
                      <img
                        src={p.image_url}
                        alt={p.title}
                        className="w-12 h-12 rounded-lg object-cover border border-zinc-700"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold">
                        {p.title?.charAt(0) || "P"}
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-white text-sm">{p.title}</h4>
                      <p className="text-xs text-zinc-400">
                        Price: ${p.price} | Status:{" "}
                        <span className={isFlash ? "text-amber-400 font-bold" : "text-zinc-500"}>
                          {isFlash ? `⚡ Flash Sale (${p.flash_discount_percentage}% OFF)` : "No Active Flash Discount"}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isFlash ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStopFlashSale(p.id)}
                        className="h-8 text-xs border-red-500/40 text-red-400 hover:bg-red-500/10 cursor-pointer"
                      >
                        Cancel Timer
                      </Button>
                    ) : null}

                    <Button
                      size="sm"
                      onClick={() => handleOpenForProduct(p)}
                      className="h-8 text-xs bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 font-semibold cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 fill-amber-300 mr-1" />
                      {isFlash ? "Update Timer" : "Set Flash Sale"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <FlashDiscountModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        products={listings || []}
        selectedProduct={selectedProduct}
        token={token}
        onSuccess={() => onRefresh && onRefresh()}
      />
    </div>
  );
}

function ReverificationCountdownBanner({ 
  reverification, 
  onGoToKyc 
}: { 
  reverification: any; 
  onGoToKyc: () => void;
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(reverification?.seconds_remaining || 0);

  useEffect(() => {
    if (!reverification?.deadline_at) return;
    setSecondsRemaining(reverification.seconds_remaining || 0);
    const interval = setInterval(() => {
      const deadline = new Date(reverification.deadline_at).getTime();
      const now = Date.now();
      const diffSec = Math.max(0, Math.floor((deadline - now) / 1000));
      setSecondsRemaining(diffSec);
    }, 1000);
    return () => clearInterval(interval);
  }, [reverification]);

  if (!reverification?.has_active_request && !reverification?.restricted && !reverification?.warning) {
    return null;
  }

  const isSubmitted = String(reverification?.status).toUpperCase() === "SUBMITTED";
  const isUnderReview = String(reverification?.status).toUpperCase() === "UNDER_REVIEW";
  const isExpired = reverification?.is_expired || secondsRemaining <= 0;

  const days = Math.floor(secondsRemaining / (3600 * 24));
  const hours = Math.floor((secondsRemaining % (3600 * 24)) / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;

  if (isSubmitted || isUnderReview) {
    return (
      <div className="mb-6 p-4 rounded-xl bg-blue-950/40 border border-blue-500/40 text-blue-100 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-white flex items-center gap-2">
              Additional KYC Verification Submitted
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/30 text-blue-300 uppercase font-bold">Under Review</span>
            </h4>
            <p className="text-xs text-blue-200/80 mt-0.5">
              Your updated identity details and documents are currently being inspected by platform compliance.
            </p>
          </div>
        </div>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={onGoToKyc}
          className="border-blue-500/40 text-blue-300 hover:bg-blue-500/20 text-xs h-8"
        >
          View Submitted KYC
        </Button>
      </div>
    );
  }

  return (
    <div className={`mb-6 p-4 rounded-xl border shadow-lg flex flex-wrap items-center justify-between gap-4 ${
      isExpired || reverification?.restricted
        ? 'bg-rose-950/50 border-rose-500/50 text-rose-100'
        : 'bg-amber-950/40 border-amber-500/40 text-amber-100'
    }`}>
      <div className="flex items-start gap-3 max-w-2xl">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
          isExpired || reverification?.restricted ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
        }`}>
          <Clock className="w-5 h-5 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-sm text-white">
              {isExpired || reverification?.restricted ? "KYC Re-Verification Deadline Expired" : "Additional KYC Verification Required"}
            </h4>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
              isExpired || reverification?.restricted ? 'bg-rose-500/30 text-rose-300' : 'bg-amber-500/30 text-amber-300'
            }`}>
              Policy: {reverification?.expiration_action || 'RESTRICT_FEATURES'}
            </span>
          </div>
          <p className="text-xs mt-1 text-zinc-200">
            <span className="text-amber-300 font-semibold">Reason:</span> "{reverification?.reason || 'Compliance verification required'}"
          </p>
          <p className="text-[11px] text-zinc-400 mt-1">
            {reverification?.deadline_at && (
              <>Server Deadline: <b className="text-white font-mono">{new Date(reverification.deadline_at).toLocaleString()}</b>. </>
            )}
            Failure to complete verification may result in store restrictions or account suspension.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        {!isExpired && (
          <div className="flex items-center gap-1.5 font-mono text-xs bg-black/40 px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-300 font-bold">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {days > 0 ? `${days}d ` : ""}{String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </span>
          </div>
        )}
        <Button
          size="sm"
          onClick={onGoToKyc}
          className={`font-bold text-xs h-8 px-4 shadow-md ${
            isExpired || reverification?.restricted
              ? 'bg-rose-600 hover:bg-rose-500 text-white'
              : 'bg-amber-500 hover:bg-amber-400 text-black'
          }`}
        >
          {isExpired ? "Submit Verification to Unlock" : "Complete Verification Now"}
        </Button>
      </div>
    </div>
  );
}