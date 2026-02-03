"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { 
  ArrowLeft, 
  Copy, 
  RefreshCw, 
  Play, 
  Square, 
  ExternalLink,
  Mail,
  Zap,
  DollarSign,
  MessageSquare,
  Trash2
} from "lucide-react";

interface UserDetail {
  // User info
  clerkId: string;
  email: string;
  name: string | null;
  createdAt: string;
  
  // Billing
  plan: string;
  stripeCustomerId: string | null;
  subscriptionStatus: string | null;
  
  // Machine
  machineId: string | null;
  appName: string | null;
  region: string | null;
  machineStatus: string | null;
  ipAddress: string | null;
  gatewayToken: string | null;
  agentmailInboxId: string | null;
  browserbaseContextId: string | null;
  lastActiveAt: string | null;
  
  // Usage stats
  usage: {
    tokensMonth: number;
    tokenLimit: number;
    costMonth: number;
    costLimit: number;
    emailsMonth: number;
    emailLimit: number;
  };
  
  // Recent usage
  recentUsage: Array<{
    date: string;
    tokens: number;
    cost: number;
    emails: number;
  }>;
}

function maskToken(token: string | null): string {
  if (!token) return "—";
  return `****-****-****-${token.slice(-4)}`;
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-xs px-2 py-1 rounded-full bg-zinc-700 text-zinc-400">No machine</span>;
  }
  
  const colors: Record<string, string> = {
    started: "bg-green-500/20 text-green-400",
    stopped: "bg-yellow-500/20 text-yellow-400",
    created: "bg-blue-500/20 text-blue-400",
    destroyed: "bg-red-500/20 text-red-400",
  };

  return (
    <span className={`text-xs px-2 py-1 rounded-full ${colors[status] || "bg-zinc-700 text-zinc-400"}`}>
      {status}
    </span>
  );
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const color = percent > 90 ? "bg-red-500" : percent > 70 ? "bg-yellow-500" : "bg-blue-500";
  
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-300">{percent.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${percent}%` }} />
      </div>
      <div className="text-xs text-zinc-500 mt-1">
        {used.toLocaleString()} / {limit.toLocaleString()}
      </div>
    </div>
  );
}

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function fetchUser() {
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch user");
      const data = await res.json();
      setUser(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUser();
  }, [userId]);

  async function handleMachineAction(action: "start" | "stop") {
    if (!user?.appName) return;
    
    setActionLoading(action);
    try {
      const res = await fetch(`/api/admin/users/${userId}/machine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Action failed");
      await fetchUser(); // Refresh
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRegenerateToken() {
    if (!confirm("Regenerate gateway token? The user will need to reconnect.")) return;
    
    setActionLoading("token");
    try {
      const res = await fetch(`/api/admin/users/${userId}/regenerate-token`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to regenerate token");
      await fetchUser();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setActionLoading(null);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  async function handleDeleteUser() {
    const confirmed = confirm(
      `⚠️ DELETE USER?\n\nThis will permanently delete:\n- Fly machine and app\n- Browserbase context\n- Agentmail inbox\n- All agent data\n\nThis cannot be undone. Continue?`
    );
    if (!confirmed) return;
    
    const doubleConfirm = confirm(
      `Are you ABSOLUTELY sure?\n\nUser: ${user?.email}\nApp: ${user?.appName}\n\nType OK in the next prompt to confirm.`
    );
    if (!doubleConfirm) return;

    setActionLoading("delete");
    try {
      const res = await fetch(`/api/admin/users/${userId}/delete`, {
        method: "DELETE",
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        alert("User deleted successfully. Redirecting...");
        router.push("/admin/users");
      } else {
        alert(`Deletion ${data.success ? "partially" : ""} failed:\n${JSON.stringify(data.results, null, 2)}`);
        await fetchUser();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-zinc-800 rounded w-48 mb-6"></div>
        <div className="grid grid-cols-2 gap-6">
          <div className="h-64 bg-zinc-800 rounded-xl"></div>
          <div className="h-64 bg-zinc-800 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        Error: {error || "User not found"}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/users" className="text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{user.name || user.email}</h1>
          <p className="text-sm text-zinc-500">{user.email}</p>
        </div>
        <StatusBadge status={user.machineStatus} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Info */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">User Info</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Clerk ID</dt>
              <dd className="font-mono text-xs">{user.clerkId}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Created</dt>
              <dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Plan</dt>
              <dd className="capitalize">{user.plan}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Stripe Customer</dt>
              <dd>
                {user.stripeCustomerId ? (
                  <a 
                    href={`https://dashboard.stripe.com/customers/${user.stripeCustomerId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline flex items-center gap-1"
                  >
                    {user.stripeCustomerId.slice(0, 14)}...
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Subscription</dt>
              <dd className="capitalize">{user.subscriptionStatus || "—"}</dd>
            </div>
          </dl>
        </div>

        {/* Machine Info */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Machine</h2>
          {user.appName ? (
            <>
              <dl className="space-y-3 text-sm mb-4">
                <div className="flex justify-between">
                  <dt className="text-zinc-500">App Name</dt>
                  <dd>
                    <a 
                      href={`https://fly.io/apps/${user.appName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline flex items-center gap-1"
                    >
                      {user.appName}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Region</dt>
                  <dd>{user.region}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Status</dt>
                  <dd><StatusBadge status={user.machineStatus} /></dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Gateway Token</dt>
                  <dd className="flex items-center gap-2">
                    <span className="font-mono text-xs">{maskToken(user.gatewayToken)}</span>
                    <button 
                      onClick={() => user.gatewayToken && copyToClipboard(user.gatewayToken)}
                      className="text-zinc-500 hover:text-zinc-300"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Email</dt>
                  <dd className="font-mono text-xs">{user.agentmailInboxId || "—"}</dd>
                </div>
              </dl>
              
              {/* Machine Actions */}
              <div className="flex gap-2 pt-4 border-t border-zinc-800">
                {user.machineStatus === "started" ? (
                  <button
                    onClick={() => handleMachineAction("stop")}
                    disabled={actionLoading !== null}
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-sm hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {actionLoading === "stop" ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => handleMachineAction("start")}
                    disabled={actionLoading !== null}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 text-green-400 rounded-lg text-sm hover:bg-green-500/20 disabled:opacity-50"
                  >
                    {actionLoading === "start" ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Start
                  </button>
                )}
                <button
                  onClick={handleRegenerateToken}
                  disabled={actionLoading !== null}
                  className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50"
                >
                  {actionLoading === "token" ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Regenerate Token
                </button>
                <button
                  onClick={handleDeleteUser}
                  disabled={actionLoading !== null}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-900/50 text-red-400 rounded-lg text-sm hover:bg-red-900 disabled:opacity-50 ml-auto"
                >
                  {actionLoading === "delete" ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Delete User
                </button>
              </div>
            </>
          ) : (
            <p className="text-zinc-500 text-sm">No machine provisioned</p>
          )}
        </div>

        {/* Usage This Month */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Usage This Month</h2>
          <div className="space-y-4">
            <UsageBar 
              used={user.usage.tokensMonth} 
              limit={user.usage.tokenLimit} 
              label="Tokens" 
            />
            <UsageBar 
              used={user.usage.costMonth} 
              limit={user.usage.costLimit} 
              label="Cost (cents)" 
            />
            <UsageBar 
              used={user.usage.emailsMonth} 
              limit={user.usage.emailLimit} 
              label="Emails" 
            />
          </div>
        </div>

        {/* Recent Usage */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Recent Usage</h2>
          {user.recentUsage.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500 uppercase">
                  <th className="pb-2">Date</th>
                  <th className="pb-2 text-right">Tokens</th>
                  <th className="pb-2 text-right">Cost</th>
                  <th className="pb-2 text-right">Emails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {user.recentUsage.map((day) => (
                  <tr key={day.date}>
                    <td className="py-2">{day.date}</td>
                    <td className="py-2 text-right font-mono">{day.tokens.toLocaleString()}</td>
                    <td className="py-2 text-right font-mono">${(day.cost / 100).toFixed(2)}</td>
                    <td className="py-2 text-right font-mono">{day.emails}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-zinc-500 text-sm">No usage data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
