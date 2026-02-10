"use client";

import { useEffect, useState } from "react";
import { Cpu, RefreshCw, AlertTriangle } from "lucide-react";

interface MachineResource {
  appName: string;
  machineId: string;
  userName: string | null;
  plan: string;
  status: string;
  config: {
    cpus: number;
    memoryMb: number;
  } | null;
  metrics: {
    memoryUsedMb: number | null;
    memoryLimitMb: number | null;
    memoryPercent: number | null;
    uptimeSeconds: number | null;
    restartCount: number | null;
  } | null;
}

interface ResourceData {
  machines: MachineResource[];
  timestamp: string;
}

function formatUptime(seconds: number | null): string {
  if (seconds === null) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function MemoryBar({ percent, used, total }: { percent: number | null; used: number | null; total: number | null }) {
  if (percent === null) {
    return <span className="text-zinc-600 text-xs">No data</span>;
  }
  
  const color = percent >= 90 ? "bg-red-500" : percent >= 70 ? "bg-amber-500" : "bg-green-500";
  const textColor = percent >= 90 ? "text-red-400" : percent >= 70 ? "text-amber-400" : "text-green-400";
  
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        <span className={textColor}>{percent}%</span>
        <span className="text-zinc-500">
          {used !== null ? `${used}MB` : "?"} / {total !== null ? `${total}MB` : "?"}
        </span>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    starter: "bg-zinc-700 text-zinc-300",
    lite: "bg-blue-900/50 text-blue-400",
    pro: "bg-purple-900/50 text-purple-400",
    business: "bg-amber-900/50 text-amber-400",
    enterprise: "bg-emerald-900/50 text-emerald-400",
  };
  
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[plan] || colors.starter}`}>
      {plan}
    </span>
  );
}

export default function ResourcesPage() {
  const [data, setData] = useState<ResourceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchResources() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/resources");
      if (!res.ok) throw new Error("Failed to fetch resource data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchResources();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchResources, 60000);
    return () => clearInterval(interval);
  }, []);

  const runningMachines = data?.machines.filter(m => m.status === "started") || [];
  const stoppedMachines = data?.machines.filter(m => m.status !== "started") || [];
  const highMemoryMachines = runningMachines.filter(
    m => m.metrics?.memoryPercent !== null && m.metrics!.memoryPercent >= 80
  );

  if (loading && !data) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-zinc-800 rounded w-48 mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-zinc-800 rounded-xl" />
          ))}
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
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Cpu className="w-6 h-6" />
            Resource Monitor
          </h1>
          {data?.timestamp && (
            <p className="text-sm text-zinc-500 mt-1">
              Last updated: {new Date(data.timestamp).toLocaleTimeString()}
            </p>
          )}
        </div>
        <button
          onClick={fetchResources}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Alerts */}
      {highMemoryMachines.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <span className="font-semibold text-amber-400">
              {highMemoryMachines.length} machine{highMemoryMachines.length > 1 ? "s" : ""} with high memory usage
            </span>
          </div>
          <div className="text-sm text-amber-300/80">
            {highMemoryMachines.map(m => (
              <span key={m.machineId} className="inline-block mr-3">
                {m.userName || m.appName}: {m.metrics?.memoryPercent}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-zinc-500 text-sm">Running</div>
          <div className="text-2xl font-bold text-green-400">{runningMachines.length}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-zinc-500 text-sm">Stopped</div>
          <div className="text-2xl font-bold text-zinc-400">{stoppedMachines.length}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-zinc-500 text-sm">Avg Memory</div>
          <div className="text-2xl font-bold">
            {(() => {
              const withMetrics = runningMachines.filter(m => m.metrics?.memoryPercent !== null);
              if (withMetrics.length === 0) return "—";
              const avg = Math.round(
                withMetrics.reduce((sum, m) => sum + m.metrics!.memoryPercent!, 0) / withMetrics.length
              );
              return `${avg}%`;
            })()}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-zinc-500 text-sm">Total Restarts</div>
          <div className="text-2xl font-bold">
            {runningMachines.reduce((sum, m) => sum + (m.metrics?.restartCount || 0), 0)}
          </div>
        </div>
      </div>

      {/* Running Machines Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-4">Running Machines</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 uppercase border-b border-zinc-800">
                <th className="pb-3 font-medium">User</th>
                <th className="pb-3 font-medium">Plan</th>
                <th className="pb-3 font-medium">Config</th>
                <th className="pb-3 font-medium w-48">Memory</th>
                <th className="pb-3 font-medium">Uptime</th>
                <th className="pb-3 font-medium">Restarts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {runningMachines
                .sort((a, b) => (b.metrics?.memoryPercent || 0) - (a.metrics?.memoryPercent || 0))
                .map((machine) => (
                <tr key={machine.machineId} className={
                  machine.metrics?.memoryPercent !== null && machine.metrics!.memoryPercent >= 90
                    ? "bg-red-900/10" : ""
                }>
                  <td className="py-3">
                    <div>
                      <span className="text-zinc-200">{machine.userName || "Unknown"}</span>
                      <div className="text-xs text-zinc-600">{machine.appName}</div>
                    </div>
                  </td>
                  <td className="py-3">
                    <PlanBadge plan={machine.plan} />
                  </td>
                  <td className="py-3 text-zinc-400 text-xs font-mono">
                    {machine.config
                      ? `${machine.config.cpus}cpu / ${machine.config.memoryMb}MB`
                      : "—"
                    }
                  </td>
                  <td className="py-3 w-48">
                    <MemoryBar
                      percent={machine.metrics?.memoryPercent ?? null}
                      used={machine.metrics?.memoryUsedMb ?? null}
                      total={machine.metrics?.memoryLimitMb ?? null}
                    />
                  </td>
                  <td className="py-3 text-zinc-400 font-mono text-xs">
                    {formatUptime(machine.metrics?.uptimeSeconds ?? null)}
                  </td>
                  <td className="py-3 font-mono text-xs">
                    <span className={
                      (machine.metrics?.restartCount || 0) > 0
                        ? "text-amber-400" : "text-zinc-500"
                    }>
                      {machine.metrics?.restartCount ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stopped Machines */}
      {stoppedMachines.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4 text-zinc-500">Stopped Machines</h2>
          <div className="space-y-2">
            {stoppedMachines.map((machine) => (
              <div key={machine.machineId} className="flex items-center gap-3 text-sm text-zinc-500">
                <span className="w-2 h-2 rounded-full bg-zinc-600" />
                <span>{machine.userName || "Unknown"}</span>
                <span className="text-zinc-700">•</span>
                <span className="text-zinc-600">{machine.appName}</span>
                <PlanBadge plan={machine.plan} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
