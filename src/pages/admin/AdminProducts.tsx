import React, { useState, useEffect } from "react";
import { safeJson } from "@/lib/utils";
import { toast } from "sonner";
import { 
  Search, 
  ShieldAlert, 
  Star, 
  CheckCircle, 
  XCircle, 
  Trash2, 
  Eye, 
  RefreshCw, 
  Flag, 
  Tag, 
  Archive, 
  AlertTriangle,
  Download,
  ShieldCheck,
  FileCode,
  Copy,
  ExternalLink,
  Lock,
  FileCheck,
  FileX
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminProductsProps {
  token: string;
}

export function AdminProducts({ token }: AdminProductsProps) {
  const [activeSubTab, setActiveSubTab] = useState('all');
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, totalRecords: 0, totalPages: 1 });
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [flagReason, setFlagReason] = useState("Policy Violation");

  // File authenticity inspection state
  const [inspectionData, setInspectionData] = useState<any>(null);
  const [loadingInspection, setLoadingInspection] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);

  // Double confirmation deletion modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<any>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/advanced/products/advanced?tab=${activeSubTab}&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&page=${page}&limit=15`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await safeJson(res);
        setProducts(data.products || []);
        setPagination(data.pagination || { page: 1, limit: 15, totalRecords: 0, totalPages: 1 });
        setTabCounts(data.tabCounts || {});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFileInspection = async (productId: string) => {
    setLoadingInspection(true);
    setInspectionData(null);
    try {
      const res = await fetch(`/api/admin/advanced/products/${productId}/file-inspection`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await safeJson(res);
        setInspectionData(data);
      }
    } catch (err) {
      console.error("Inspection error:", err);
    } finally {
      setLoadingInspection(false);
    }
  };

  useEffect(() => {
    if (selectedProduct) {
      fetchFileInspection(selectedProduct.id);
    } else {
      setInspectionData(null);
    }
  }, [selectedProduct]);

  const handleAdminDownload = async (product: any) => {
    if (!product || !product.id) return;
    setDownloadingFile(true);
    const toastId = toast.loading(`Preparing secure admin verification download for "${product.title}"...`);

    try {
      const res = await fetch(`/api/admin/advanced/products/${product.id}/verification-download`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        let errMessage = "Download failed.";
        try {
          const errData = await res.json();
          errMessage = errData.error || errMessage;
        } catch (e) {}
        toast.error(errMessage, { id: toastId });
        setDownloadingFile(false);
        return;
      }

      // Extract filename from header or fallback to title
      let filename = `${product.title.replace(/[^a-zA-Z0-9_-]/g, "_")}.zip`;
      const disposition = res.headers.get("content-disposition");
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          filename = decodeURIComponent(match[1]);
        }
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`Original file "${filename}" downloaded for authenticity inspection.`, { id: toastId });
    } catch (err: any) {
      toast.error(err.message || "Failed to download verification asset", { id: toastId });
    } finally {
      setDownloadingFile(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  useEffect(() => {
    fetchProducts();
  }, [activeSubTab, page, category]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchProducts();
  };

  const openDeleteModal = (product: any) => {
    setProductToDelete(product);
    setDeleteConfirmText("");
    setDeleteConfirmChecked(false);
    setDeleteModalOpen(true);
  };

  const executeAction = async (id: string, action: string, extraBody: any = {}) => {
    try {
      const res = await fetch(`/api/admin/advanced/products/${id}/action`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action, moderation_note: flagReason, ...extraBody })
      });
      if (!res.ok) throw new Error("Action failed");
      const data = await safeJson(res);
      toast.success(data.message || `Action ${action} executed`);
      fetchProducts();
      if (selectedProduct && selectedProduct.id === id) {
        if (action === 'delete') {
          setSelectedProduct(null);
        } else if (data.product) {
          setSelectedProduct(data.product);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to execute action");
    }
  };

  return (
    <div className="bg-[#141428]/80 backdrop-blur-xl border border-border rounded-xl p-6 shadow-2xl font-sans text-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white tracking-wide">Products & Assets Command</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Manage, review, feature and moderate digital products across marketplace</p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchProducts} className="gap-2 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none border-b border-white/10">
        {[
          { id: 'all', label: 'All Products' },
          { id: 'pending', label: 'Pending Review' },
          { id: 'approved', label: 'Approved' },
          { id: 'rejected', label: 'Rejected' },
          { id: 'suspended', label: 'Suspended' },
          { id: 'archived', label: 'Archived' },
          { id: 'featured', label: 'Featured' },
          { id: 'reported', label: 'Reported / Moderated' }
        ].map(subTab => (
          <button
            key={subTab.id}
            onClick={() => { setActiveSubTab(subTab.id); setPage(1); }}
            className={`px-4 py-2 rounded-lg font-mono text-xs uppercase tracking-wider flex items-center gap-2 whitespace-nowrap transition-all ${
              activeSubTab === subTab.id
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

      {/* Search & Filter Bar */}
      <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search Title, ID, Seller Name, Description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#101020] border border-border/50 rounded-lg pl-10 pr-4 py-2 text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs w-full">
            Filter Results
          </Button>
        </div>
      </form>

      {/* Main Table + Detail Modal Panel */}
      <div className="flex flex-col xl:flex-row gap-6">
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-black/40 text-[11px] font-mono text-indigo-300 uppercase tracking-wider">
                <th className="py-3 px-4">Product ID & Title</th>
                <th className="py-3 px-4">Seller</th>
                <th className="py-3 px-4">Price</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Sales</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs text-gray-300">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="w-9 h-9 object-cover rounded-lg border border-border/50" />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
                          {p.title?.charAt(0) || 'P'}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          {p.title}
                          {p.is_featured === 1 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-mono flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5" /> FEATURED
                            </span>
                          )}
                          {p.moderation_flags && (
                            <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[9px] font-mono flex items-center gap-0.5">
                              <ShieldAlert className="w-2.5 h-2.5" /> {p.moderation_flags}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground">{p.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-white">{p.seller_name || 'System Seller'}</div>
                    <div className="text-[10px] text-muted-foreground">{p.seller_email}</div>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-emerald-400">${p.price?.toFixed(2)}</td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      p.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      p.status === 'pending' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      p.status === 'suspended' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                      'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-indigo-300">{p.sales || 0}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex gap-1.5 justify-end items-center">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleAdminDownload(p)} 
                        title="Verify & Download Original File (Admin Privilege)"
                        className="h-7 text-[10px] border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/20 hover:text-white px-2 flex items-center gap-1"
                      >
                        <Download className="w-3 h-3 text-indigo-400" />
                        <span className="hidden sm:inline">Verify File</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSelectedProduct(p)} className="h-7 text-[10px] border-border text-gray-300 hover:text-white px-2">
                        <Eye className="w-3 h-3 mr-1" /> Inspect
                      </Button>
                      {p.status === 'pending' && (
                        <Button size="sm" onClick={() => executeAction(p.id, 'approve')} className="h-7 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2">
                          Approve
                        </Button>
                      )}
                      {p.status === 'active' && (
                        <Button size="sm" onClick={() => executeAction(p.id, 'suspend')} className="h-7 text-[10px] bg-red-600/30 text-red-400 hover:bg-red-600/50 border border-red-500/30 px-2">
                          Suspend
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {products.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground font-mono">
                    No products found matching active filter state.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/10 text-xs font-mono text-muted-foreground">
            <div>
              Showing {products.length} of {pagination.totalRecords} records (Page {pagination.page} of {pagination.totalPages})
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

      {/* Selected Product Large Modal Dialog */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#101024] border border-indigo-500/40 rounded-2xl max-w-5xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-6 shadow-[0_0_50px_rgba(79,70,229,0.2)] animate-in fade-in zoom-in-95 text-white">
            <div className="flex justify-between items-center pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 font-bold">
                  <Tag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-xl">{selectedProduct.title}</h3>
                  <p className="text-xs text-muted-foreground font-mono">Product ID: {selectedProduct.id} • Category: {selectedProduct.type || 'Digital Asset'}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedProduct(null)} 
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Product Preview & Image */}
              <div className="lg:col-span-5 space-y-4">
                {selectedProduct.image_url ? (
                  <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40 relative aspect-video flex items-center justify-center">
                    <img src={selectedProduct.image_url} alt="" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-white/5 aspect-video flex items-center justify-center text-muted-foreground text-xs">
                    No Preview Image
                  </div>
                )}

                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3 text-xs">
                  <div className="text-xs font-bold text-indigo-400 uppercase font-mono">Seller Information</div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-sm border border-emerald-500/30">
                      {selectedProduct.seller_name?.[0] || 'S'}
                    </div>
                    <div>
                      <div className="font-semibold text-white">{selectedProduct.seller_name || 'Anonymous Seller'}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{selectedProduct.seller_email || selectedProduct.seller_id}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                    <span className="text-[10px] text-muted-foreground uppercase font-mono block">Status</span>
                    <span className={`font-bold font-mono uppercase ${selectedProduct.status === 'active' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {selectedProduct.status}
                    </span>
                  </div>
                  <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                    <span className="text-[10px] text-muted-foreground uppercase font-mono block">Featured</span>
                    <span className="font-bold font-mono text-indigo-300">
                      {Boolean(selectedProduct.is_featured) ? '★ FEATURED' : 'Standard'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Product Specifications & Admin Actions */}
              <div className="lg:col-span-7 space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <span className="text-[10px] text-emerald-400 font-mono uppercase block">Listing Price</span>
                    <span className="text-2xl font-bold font-mono text-emerald-300">${selectedProduct.price?.toFixed(2)}</span>
                  </div>
                  <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                    <span className="text-[10px] text-indigo-400 font-mono uppercase block">Category</span>
                    <span className="text-sm font-bold font-mono text-indigo-200 truncate block">{selectedProduct.type}</span>
                  </div>
                  <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                    <span className="text-[10px] text-purple-400 font-mono uppercase block">Delivery Mode</span>
                    <span className="text-sm font-bold font-mono text-purple-200 uppercase block">{selectedProduct.mode || 'Instant'}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold text-gray-300 uppercase font-mono">Product Description</span>
                  <div className="p-3.5 bg-black/40 rounded-xl border border-white/10 text-xs text-gray-300 leading-relaxed max-h-36 overflow-y-auto whitespace-pre-wrap">
                    {selectedProduct.description || 'No description provided for this listing.'}
                  </div>
                </div>

                {/* Digital Asset Authenticity & Admin Verification Panel */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/40 via-purple-950/20 to-black/60 border border-indigo-500/40 space-y-3.5 shadow-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white uppercase font-mono tracking-wider flex items-center gap-1.5">
                          Digital Asset Authenticity Inspection
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            Admin Privilege
                          </span>
                        </span>
                      </div>
                    </div>
                    {inspectionData?.live_demo_url && (
                      <a 
                        href={inspectionData.live_demo_url} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-[11px] font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1 bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20"
                      >
                        <ExternalLink className="w-3 h-3" /> Live Demo
                      </a>
                    )}
                  </div>

                  {loadingInspection ? (
                    <div className="flex items-center justify-center py-4 text-xs text-indigo-300 font-mono gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                      Inspecting original asset package & computing SHA-256 hash...
                    </div>
                  ) : inspectionData?.has_file ? (
                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                        <div className="p-2 bg-black/40 rounded-lg border border-white/5">
                          <span className="text-[10px] text-muted-foreground block">Original Filename</span>
                          <span className="font-semibold text-indigo-200 truncate block text-[11px]" title={inspectionData.original_filename}>
                            {inspectionData.original_filename}
                          </span>
                        </div>
                        <div className="p-2 bg-black/40 rounded-lg border border-white/5">
                          <span className="text-[10px] text-muted-foreground block">Original Size</span>
                          <span className="font-semibold text-emerald-300 text-[11px]">
                            {inspectionData.file_size_formatted || `${(inspectionData.file_size / 1024 / 1024).toFixed(2)} MB`}
                          </span>
                        </div>
                        <div className="p-2 bg-black/40 rounded-lg border border-white/5">
                          <span className="text-[10px] text-muted-foreground block">Format / MIME</span>
                          <span className="font-semibold text-purple-200 uppercase text-[11px] truncate block">
                            {inspectionData.file_extension || inspectionData.content_type}
                          </span>
                        </div>
                        <div className="p-2 bg-black/40 rounded-lg border border-white/5">
                          <span className="text-[10px] text-muted-foreground block">Upload Record</span>
                          <span className="font-semibold text-gray-300 text-[11px]">
                            {new Date(inspectionData.upload_timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* SHA-256 Checksum Hash */}
                      {inspectionData.sha256_hash && (
                        <div className="p-2 bg-black/60 rounded-lg border border-white/10 flex items-center justify-between gap-2">
                          <div className="flex-1 truncate">
                            <span className="text-[9px] uppercase font-mono text-muted-foreground block">SHA-256 Checksum (Authenticity Signature)</span>
                            <span className="text-[10px] font-mono text-gray-300 select-all truncate block">
                              {inspectionData.sha256_hash}
                            </span>
                          </div>
                          <button
                            onClick={() => copyToClipboard(inspectionData.sha256_hash, "SHA-256 Checksum")}
                            className="p-1.5 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            title="Copy Checksum"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {/* Heuristic Warnings & Plagiarism Detection */}
                      <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                        {inspectionData.is_format_mismatch ? (
                          <div className="w-full p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                            <span>{inspectionData.mismatch_warning || "Format mismatch: Claimed type differs from uploaded asset format."}</span>
                          </div>
                        ) : (
                          <div className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Format Matches Category ({inspectionData.category})
                          </div>
                        )}

                        {inspectionData.duplicate_matches && inspectionData.duplicate_matches.length > 0 ? (
                          <div className="w-full p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 flex items-center gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-red-400" />
                            <span>Duplicate File Asset detected in {inspectionData.duplicate_matches.length} other listing(s).</span>
                          </div>
                        ) : (
                          <div className="px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" /> Unique Registry Asset (No Duplicates)
                          </div>
                        )}
                      </div>

                      {/* Verify & Download Primary Button */}
                      <div className="pt-1 flex flex-col sm:flex-row gap-2">
                        <Button 
                          onClick={() => handleAdminDownload(selectedProduct)}
                          disabled={downloadingFile}
                          className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold h-9 text-xs shadow-[0_0_20px_rgba(99,102,241,0.3)] flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {downloadingFile ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Downloading Original Asset...
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" />
                              Verify & Download Original File (Admin Free Access)
                            </>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          onClick={() => executeAction(selectedProduct.id, 'verify')}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs flex items-center gap-1"
                        >
                          <FileCheck className="w-3.5 h-3.5" />
                          Mark as Verified
                        </Button>

                        <Button
                          size="sm"
                          onClick={() => executeAction(selectedProduct.id, 'flag_suspicious', { flag_reason: 'Flagged as Suspicious / Fake Asset after Admin file inspection' })}
                          className="bg-red-600/30 hover:bg-red-600/50 text-red-400 border border-red-500/30 text-xs flex items-center gap-1"
                        >
                          <FileX className="w-3.5 h-3.5" />
                          Flag as Suspicious
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between font-mono">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span>{inspectionData?.message || "No digital asset file uploaded for this listing."}</span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => executeAction(selectedProduct.id, 'flag', { flag_reason: 'Missing digital asset file' })}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] h-7"
                      >
                        Flag Missing File
                      </Button>
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-500/30 space-y-3">
                  <div className="text-xs font-bold text-indigo-300 uppercase font-mono">Administrative Controls</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedProduct.status !== 'active' && (
                      <Button size="sm" onClick={() => executeAction(selectedProduct.id, 'approve', { flag_reason: flagReason })} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve Listing
                      </Button>
                    )}
                    {selectedProduct.status !== 'suspended' && (
                      <Button size="sm" onClick={() => executeAction(selectedProduct.id, 'suspend', { flag_reason: flagReason })} className="bg-red-600/30 text-red-400 hover:bg-red-600/50 border border-red-500/30 text-xs">
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Suspend
                      </Button>
                    )}
                    {Boolean(selectedProduct.is_featured) ? (
                      <Button size="sm" onClick={() => executeAction(selectedProduct.id, 'unfeature')} variant="outline" className="border-amber-500/40 text-amber-300 hover:bg-amber-500/20 text-xs">
                        <Star className="w-3.5 h-3.5 mr-1 fill-amber-300" /> Unfeature
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => executeAction(selectedProduct.id, 'feature')} className="bg-amber-600 hover:bg-amber-700 text-white text-xs">
                        <Star className="w-3.5 h-3.5 mr-1" /> Feature
                      </Button>
                    )}
                    {selectedProduct.status === 'archived' ? (
                      <Button size="sm" onClick={() => executeAction(selectedProduct.id, 'restore')} variant="outline" className="border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/20 text-xs">
                        Restore
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => executeAction(selectedProduct.id, 'archive')} variant="outline" className="border-border text-gray-300 hover:text-white text-xs">
                        <Archive className="w-3.5 h-3.5 mr-1" /> Archive
                      </Button>
                    )}
                  </div>

                  <div className="pt-2 border-t border-white/10 flex items-center gap-2">
                    <select
                      value={flagReason}
                      onChange={(e) => setFlagReason(e.target.value)}
                      className="bg-[#141428] border border-border rounded-lg px-3 py-1.5 text-xs text-white flex-1"
                    >
                      <option value="Policy Violation">Policy Violation</option>
                      <option value="Copyright / IP Infringement">Copyright / IP Infringement</option>
                      <option value="Duplicate Listing">Duplicate Listing</option>
                      <option value="Malware / Suspicious File">Malware / Suspicious File</option>
                      <option value="Prohibited Content">Prohibited Content</option>
                    </select>
                    <Button size="sm" onClick={() => executeAction(selectedProduct.id, 'flag', { flag_reason: flagReason })} className="bg-red-600 hover:bg-red-700 text-white text-xs">
                      <Flag className="w-3.5 h-3.5 mr-1" /> Flag Reason
                    </Button>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button size="sm" onClick={() => openDeleteModal(selectedProduct)} variant="outline" className="border-red-900 text-red-500 hover:bg-red-950 text-xs">
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete Product Permanently
                  </Button>
                  <Button size="sm" onClick={() => setSelectedProduct(null)} variant="outline" className="border-border text-white text-xs">
                    Close Inspector
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Double Confirmation Delete Modal */}
      {deleteModalOpen && productToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#121226] border border-red-500/40 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-red-500/20 border border-red-500/40 rounded-xl text-red-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white">Permanently Remove Listing</h3>
                <p className="text-xs text-red-400 font-mono mt-0.5">Destructive Marketplace Action</p>
              </div>
              <button onClick={() => setDeleteModalOpen(false)} className="text-gray-400 hover:text-white text-sm">✕</button>
            </div>

            <div className="bg-black/40 border border-white/10 rounded-xl p-3 space-y-2 text-xs">
              <div className="flex justify-between text-gray-300">
                <span className="text-muted-foreground font-mono">Product:</span>
                <span className="font-bold text-white">{productToDelete.title}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span className="text-muted-foreground font-mono">ID:</span>
                <span className="font-mono text-indigo-300">{productToDelete.id}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span className="text-muted-foreground font-mono">Seller:</span>
                <span>{productToDelete.seller_name || productToDelete.seller_email}</span>
              </div>
            </div>

            <div className="p-3 bg-red-950/30 border border-red-900/50 rounded-xl text-[11px] text-gray-300 leading-relaxed space-y-1">
              <p className="font-semibold text-red-300">Safety & Preservation Guarantee:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                <li>This listing will be immediately removed from marketplace browsing, search, and seller dashboard.</li>
                <li>Financial transaction history and existing buyer download access are strictly preserved.</li>
                <li>An immutable audit log entry is recorded for administrative accountability.</li>
              </ul>
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={deleteConfirmChecked}
                  onChange={(e) => setDeleteConfirmChecked(e.target.checked)}
                  className="mt-0.5 rounded bg-black/40 border-gray-600 text-red-600 focus:ring-red-500"
                />
                <span className="text-xs text-gray-300">
                  I confirm that I want to remove this product from the marketplace and seller dashboard.
                </span>
              </label>

              <div>
                <label className="text-[11px] font-mono text-muted-foreground block mb-1">
                  Type <span className="text-red-400 font-bold">DELETE</span> or <span className="text-white font-bold">{productToDelete.title}</span> to confirm:
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE or product title"
                  className="w-full bg-black/50 border border-border/60 rounded-lg px-3 py-2 text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-red-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <Button size="sm" variant="outline" onClick={() => setDeleteModalOpen(false)} className="border-border text-gray-300 text-xs">
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!deleteConfirmChecked || (deleteConfirmText.trim() !== 'DELETE' && deleteConfirmText.trim().toLowerCase() !== productToDelete.title.trim().toLowerCase())}
                onClick={() => {
                  executeAction(productToDelete.id, 'delete');
                  setDeleteModalOpen(false);
                }}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Permanently Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
