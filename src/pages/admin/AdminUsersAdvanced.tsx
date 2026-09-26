import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import {
  Users, Search, Filter, Shield, ShieldAlert, CheckCircle, XCircle, 
  UserCheck, UserX, Key, LogOut, FileText, Bell, Lock, Unlock, RefreshCw, 
  ChevronLeft, ChevronRight, MoreVertical, Edit3, DollarSign, ShoppingBag, 
  Globe, Phone, Mail, AlertTriangle, Eye, ArrowUpDown, Calendar, Clock,
  User, Building, CreditCard
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { User360DetailModal } from "@/components/admin/User360DetailModal";

interface AdminUsersAdvancedProps {
  token: string;
}

export function AdminUsersAdvanced({ token }: AdminUsersAdvancedProps) {
  // State for user list
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<any>({});
  
  // Filters & Controls
  const [activeTab, setActiveTab] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [verificationFilter, setVerificationFilter] = useState('all');
  const [kycFilter, setKycFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  // Selected User Detail Modal State
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Action Confirmation Modals State
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'ban' | 'suspend' | 'verify' | 'logout' | 'reset' | null;
    user: any;
    data?: any;
  }>({ open: false, type: null, user: null });

  const fetchUsers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        role: roleFilter,
        status: statusFilter,
        verification: verificationFilter,
        kycStatus: kycFilter,
        filterTab: activeTab,
        sortBy,
        sortOrder,
        page: page.toString(),
        limit: limit.toString()
      });

      const res = await fetch(`/api/admin/users/advanced?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(data.users || []);
      setPagination(data.pagination || { total: 0, totalPages: 1 });
      setCounts(data.counts || {});
    } catch (err: any) {
      toast.error(err.message || "Error fetching users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token, activeTab, roleFilter, statusFilter, verificationFilter, kycFilter, sortBy, sortOrder, page, limit]);

  // Debounced search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchUsers();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Open full user 360° inspection view
  const openUserDetail = (userId: string) => {
    setSelectedUserId(userId);
  };

  // Perform Quick Table User Action
  const handleUserAction = async (actionType: string, payload: any = {}) => {
    if (!selectedUserId && !confirmDialog.user?.id) return;
    const targetId = selectedUserId || confirmDialog.user?.id;

    try {
      const res = await fetch(`/api/admin/users/${targetId}/${actionType}`, {
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

      setConfirmDialog({ open: false, type: null, user: null });
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const getRiskScoreBadge = (score: number) => {
    if (score >= 50) return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-500/20 text-red-400 border border-red-500/30">HIGH ({score})</span>;
    if (score >= 20) return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">MED ({score})</span>;
    return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">LOW ({score})</span>;
  };

  const getKycBadge = (status: string) => {
    if (status === 'verified') return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-500/20 text-emerald-400">Verified</span>;
    if (status === 'pending') return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-500/20 text-amber-400">Pending</span>;
    if (status === 'rejected') return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-rose-500/20 text-rose-400">Rejected</span>;
    return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-gray-500/20 text-gray-400">None</span>;
  };

  return (
    <div className="space-y-6">
      {/* Top Filter View Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-border/40">
        {[
          { id: 'all', label: 'All Users', count: counts.all },
          { id: 'buyers', label: 'Buyers', count: counts.buyers },
          { id: 'sellers', label: 'Sellers', count: counts.sellers },
          { id: 'admins', label: 'Admins', count: counts.admins },
          { id: 'active', label: 'Active', count: counts.active },
          { id: 'suspended', label: 'Suspended', count: counts.suspended },
          { id: 'banned', label: 'Banned', count: counts.banned },
          { id: 'pending_verification', label: 'Pending Verification', count: counts.pending_verification }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setPage(1); }}
            className={`flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 border border-indigo-400/30'
                : 'bg-[#141428]/60 text-muted-foreground border border-border/40 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Control Toolbar */}
      <div className="bg-[#141428]/80 backdrop-blur-md p-4 rounded-2xl border border-border flex flex-col lg:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full lg:w-96">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by ID, name, email, username, phone, country..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-black/40 border-gray-800 text-white text-xs h-10 rounded-xl"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="bg-black/40 border border-gray-800 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Role: All</option>
            <option value="buyer">Buyers Only</option>
            <option value="seller">Sellers Only</option>
            <option value="admin">Admins Only</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-black/40 border border-gray-800 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Status: All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>

          <select
            value={kycFilter}
            onChange={(e) => { setKycFilter(e.target.value); setPage(1); }}
            className="bg-black/40 border border-gray-800 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">KYC: All</option>
            <option value="verified">KYC Verified</option>
            <option value="pending">KYC Pending</option>
            <option value="rejected">KYC Rejected</option>
            <option value="none">No KYC</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-black/40 border border-gray-800 text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="created_at">Sort: Join Date</option>
            <option value="spending">Sort: Total Spending</option>
            <option value="orders">Sort: Orders Count</option>
            <option value="risk_score">Sort: Risk Score</option>
            <option value="name">Sort: Name</option>
            <option value="last_login">Sort: Last Login</option>
          </select>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="border-gray-800 text-xs h-9 px-3"
          >
            <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
            {sortOrder.toUpperCase()}
          </Button>

          <Button
            size="sm"
            onClick={() => fetchUsers()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Reload
          </Button>
        </div>
      </div>

      {/* Main Users Table */}
      <Card className="bg-[#141428]/80 backdrop-blur-xl border-border overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#0A0A0F] text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/50 font-mono">
              <tr>
                <th className="px-5 py-3.5">User Info</th>
                <th className="px-5 py-3.5">Type / Role</th>
                <th className="px-5 py-3.5">Contact & Location</th>
                <th className="px-5 py-3.5">KYC & Status</th>
                <th className="px-5 py-3.5">Orders & Spend</th>
                <th className="px-5 py-3.5">Risk Score</th>
                <th className="px-5 py-3.5">Joined</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white uppercase text-xs shadow-md">
                        {u.name?.[0] || 'U'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 font-bold text-white text-sm flex-wrap">
                          <span>{u.name}</span>
                          {u.is_verified ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : null}
                          <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded tracking-wider ${
                            u.role === 'admin' || u.role === 'superadmin' ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50 shadow-sm' :
                            u.role === 'seller' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50 shadow-sm' :
                            'bg-indigo-500/30 text-indigo-300 border border-indigo-500/50 shadow-sm'
                          }`}>
                            {u.role === 'admin' || u.role === 'superadmin' ? 'ADMIN' : u.role === 'seller' ? 'SELLER' : 'USER'}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          @{u.username} • <span className="text-gray-500">{u.id.substring(0, 8)}...</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                      u.role === 'admin' || u.role === 'superadmin' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                      u.role === 'seller' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                      'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                    }`}>
                      {u.role === 'admin' || u.role === 'superadmin' ? 'ADMIN' :
                       u.role === 'seller' ? 'SELLER' :
                       'USER'}
                    </span>
                  </td>

                  <td className="px-5 py-4">
                    <div className="text-white text-xs">{u.email}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                      <span>{u.phone_number || 'No phone'}</span>
                      <span>•</span>
                      <span className="font-mono">{u.country}</span>
                    </div>
                  </td>

                  <td className="px-5 py-4 space-y-1">
                    <div className="flex items-center gap-2">
                      {getKycBadge(u.kyc_status)}
                      {u.is_banned ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-rose-500/20 text-rose-400">Banned</span>
                      ) : u.is_suspended ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-500/20 text-amber-400">Suspended</span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-500/20 text-emerald-400">Active</span>
                      )}
                    </div>
                  </td>

                  <td className="px-5 py-4">
                    <div className="font-bold text-white text-xs">{u.orders_count || 0} Orders</div>
                    <div className="text-[11px] text-emerald-400 font-mono">${(u.total_spending || 0).toFixed(2)} spent</div>
                  </td>

                  <td className="px-5 py-4">
                    {getRiskScoreBadge(u.risk_score || 0)}
                  </td>

                  <td className="px-5 py-4 text-[11px] font-mono text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>

                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openUserDetail(u.id)}
                        className="h-8 border-indigo-500/30 hover:bg-indigo-500/20 text-xs px-2.5 text-indigo-300"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Inspect
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDialog({ open: true, type: u.is_banned ? 'ban' : 'ban', user: u })}
                        className={`h-8 text-xs ${u.is_banned ? 'text-emerald-400 hover:bg-emerald-500/20' : 'text-rose-400 hover:bg-rose-500/20'}`}
                      >
                        {u.is_banned ? 'Unban' : 'Ban'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {users.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">
                    No matching users found for current filter criteria
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Bar */}
        <div className="p-4 border-t border-border/50 bg-[#0A0A0F] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground font-mono">
            Showing Page <span className="text-white font-bold">{pagination.page}</span> of{' '}
            <span className="text-white font-bold">{pagination.totalPages}</span> ({pagination.total} total users)
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 mr-4 text-xs">
              <span className="text-muted-foreground">Per page:</span>
              <select
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                className="bg-black/50 border border-gray-800 text-white rounded px-2 py-1 text-xs"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="h-8 border-gray-800 text-xs"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Previous
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(p => p + 1)}
              className="h-8 border-gray-800 text-xs"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </Card>

      {/* 360° USER & SELLER DETAIL MODAL / DRAWER */}
      {selectedUserId && (
        <User360DetailModal
          userId={selectedUserId}
          token={token}
          onClose={() => setSelectedUserId(null)}
          onRefreshList={fetchUsers}
        />
      )}

      {/* CONFIRMATION DIALOG */}
      <Dialog open={confirmDialog.open} onOpenChange={(o) => !o && setConfirmDialog({ open: false, type: null, user: null })}>
        <DialogContent className="bg-[#141428] border border-rose-500/30 text-white">
          <DialogHeader>
            <DialogTitle className="text-rose-400">
              Confirm Action: {confirmDialog.type?.toUpperCase()}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-xs text-muted-foreground">
            Are you sure you want to perform <strong>{confirmDialog.type}</strong> on user{' '}
            <strong className="text-white">{confirmDialog.user?.name}</strong> ({confirmDialog.user?.email})?
            This operation will be logged to audit security records.
          </div>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDialog({ open: false, type: null, user: null })}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (confirmDialog.type === 'ban') {
                  handleUserAction('ban', { is_banned: !confirmDialog.user?.is_banned });
                }
              }}
            >
              Confirm Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
