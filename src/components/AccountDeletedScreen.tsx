import React from "react";
import { UserX, Calendar, ShieldAlert, LogOut, Mail, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

interface AccountDeletedScreenProps {
  reason?: string;
  deletedAt?: string;
  deletedBy?: string;
}

export function AccountDeletedScreen({
  reason,
  deletedAt,
  deletedBy
}: AccountDeletedScreenProps) {
  const { logout, user } = useAuth();

  const formattedDate = deletedAt
    ? (() => {
        try {
          return new Date(deletedAt).toLocaleString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZoneName: "short"
          });
        } catch {
          return deletedAt;
        }
      })()
    : "Recently";

  const displayReason = reason && reason.trim() ? reason.trim() : "Administrative Compliance and Terms Violation";

  return (
    <div
      id="account-deleted-fullscreen-container"
      className="fixed inset-0 z-[999999] bg-[#070714] text-white flex flex-col items-center justify-center p-4 sm:p-6 overflow-y-auto"
      style={{ minHeight: "100vh", width: "100vw" }}
    >
      {/* Background ambient accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-rose-600/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-red-800/20 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-lg w-full bg-[#111126]/90 border border-rose-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center">
        {/* Warning Icon Badge */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-6 text-rose-400 shadow-inner">
          <UserX className="w-8 h-8 sm:w-10 sm:h-10 text-rose-500 animate-pulse" />
        </div>

        {/* Title */}
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
          Your Account Has Been Deleted
        </h1>

        <p className="text-sm text-gray-400 mb-6 max-w-sm">
          Access to your Aurevyxon account ({user?.email || "user"}) has been revoked by administration.
        </p>

        {/* Details Card */}
        <div className="w-full bg-[#0b0b1a] border border-rose-500/20 rounded-xl p-4 sm:p-5 text-left space-y-4 mb-6">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-400 uppercase tracking-wider mb-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              Deletion Reason
            </div>
            <div className="text-sm text-gray-200 bg-rose-950/30 border border-rose-900/40 rounded-lg p-3 leading-relaxed font-medium">
              {displayReason}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-white/5">
            <div>
              <div className="flex items-center gap-1 text-[11px] text-gray-400 mb-0.5">
                <Calendar className="w-3 h-3 text-gray-400" />
                Date Deleted
              </div>
              <div className="text-xs text-gray-200 font-mono font-medium">
                {formattedDate}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1 text-[11px] text-gray-400 mb-0.5">
                <Clock className="w-3 h-3 text-gray-400" />
                Status
              </div>
              <div className="text-xs text-rose-400 font-bold uppercase tracking-wide flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block mr-1" />
                DELETED
              </div>
            </div>
          </div>
        </div>

        {/* Info notice */}
        <p className="text-xs text-gray-400 leading-relaxed mb-6 px-2">
          All protected actions (including purchasing, selling, messaging, and dashboard access) are restricted. If you believe this action was taken in error, you may contact support.
        </p>

        {/* Action button */}
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <Button
            onClick={() => logout()}
            className="w-full bg-rose-600 hover:bg-rose-500 text-white font-semibold h-11 rounded-xl shadow-lg shadow-rose-900/30 flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>

          <a
            href="mailto:support@aurevyxon.com"
            className="w-full border border-gray-800 text-gray-300 hover:bg-white/5 h-11 rounded-xl flex items-center justify-center gap-2 font-medium text-sm transition-colors"
          >
            <Mail className="w-4 h-4" />
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}
