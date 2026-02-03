"use client";

import { useEffect, useState } from "react";
import { Server, CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react";

interface HealthData {
  machines: {
    stats: {
      total: number;
      started: number;
      stopped: number;
      other: number;
    };
    list: Array<{
      id: string;
      appName: string;
      status: string;
      region: string;
      lastActiveAt: string | null;
    }>;
  };
  services: Array<{
    name: string;
    status: string;
  }>;
  errors: Array<{
    timestamp: string;
    userId: string;
    model: string;
    error: string;
  }>;
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    started: "bg-green-500",
    stopped: "bg-yellow-500",
    ok: "bg-green-500",
    error: "bg-red-500",
  };
  
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || "bg-zinc-500"}`} />
  );
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

export default function HealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchHealth() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/health");
      if (!res.ok) throw new Error("Failed to fetch health data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchHealth();
  }, []);

  if (loading && !data) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-zinc-800 rounded w-48 mb-6"></div>
        <div className="grid grid-cols-3 gap-6">
          <div className="h-48 bg-zinc-800 rounded-xl"></div>
          <div className="h-48 bg-zinc-800 rounded-xl col-span-2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        Error: {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">System Health</h1>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Machine Stats */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Server className="w-5 h-5" />
            Machines
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Total</span>
              <span className="font-mono">{data?.machines.stats.total}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2">
                <StatusDot status="started" />
                <span className="text-zinc-400">Running</span>
              </span>
              <span className="font-mono text-green-400">{data?.machines.stats.started}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2">
                <StatusDot status="stopped" />
                <span className="text-zinc-400">Stopped</span>
              </span>
              <span className="font-mono text-yellow-400">{data?.machines.stats.stopped}</span>
            </div>
          </div>
        </div>

        {/* External Services */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">External Services</h2>
          <div className="space-y-3">
            {data?.services.map((service) => (
              <div key={service.name} className="flex justify-between items-center">
                <span className="text-zinc-400">{service.name}</span>
                <span className="flex items-center gap-2">
                  {service.status === "ok" ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span className={service.status === "ok" ? "text-green-400" : "text-red-400"}>
                    {service.status}
                  </span>
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center">
              <span className="text-zinc-400">Turso (DB)</span>
              <span className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-green-400">ok</span>
              </span>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Errors (24h)</h2>
          <div className="text-center py-4">
            <div className="text-4xl font-bold">
              {data?.errors.length || 0}
            </div>
            <p className="text-sm text-zinc-500 mt-1">
              {data?.errors.length === 0 ? "All clear!" : "Review below"}
            </p>
          </div>
        </div>
      </div>

      {/* Machines Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4">All Machines</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 uppercase border-b border-zinc-800">
                <th className="pb-3 font-medium">App</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Region</th>
                <th className="pb-3 font-medium">Last Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {data?.machines.list.map((machine) => (
                <tr key={machine.id}>
                  <td className="py-3">
                    <a
                      href={`https://fly.io/apps/${machine.appName}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      {machine.appName}
                    </a>
                  </td>
                  <td className="py-3">
                    <span className="flex items-center gap-2">
                      <StatusDot status={machine.status} />
                      {machine.status}
                    </span>
                  </td>
                  <td className="py-3 text-zinc-400">{machine.region}</td>
                  <td className="py-3 text-zinc-400">{formatTimeAgo(machine.lastActiveAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error Log */}
      {data?.errors && data.errors.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            Recent Errors
          </h2>
          <div className="space-y-3">
            {data.errors.map((error, i) => (
              <div key={i} className="bg-zinc-800/50 rounded-lg p-3 text-sm">
                <div className="flex justify-between text-xs text-zinc-500 mb-1">
                  <span>{error.model}</span>
                  <span>{formatTimeAgo(error.timestamp)}</span>
                </div>
                <div className="text-red-400 font-mono text-xs break-all">
                  {error.error}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
