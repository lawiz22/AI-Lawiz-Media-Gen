import React, { useEffect, useState } from 'react';
import type { SystemMetrics } from '../types';

const indicators = [
    { label: 'CPU', key: 'cpuPercent', color: '#169c26', description: 'Total system CPU usage', unit: '%' },
    { label: 'RAM', key: 'ramPercent', color: '#16862a', description: 'Physical system RAM in use', unit: '%' },
    { label: 'GPU', key: 'gpuPercent', color: '#1689e8', description: 'NVIDIA GPU utilization (GPU 0)', unit: '%' },
    { label: 'VRAM', key: 'vramPercent', color: '#176bc0', description: 'NVIDIA dedicated video memory in use (GPU 0)', unit: '%' },
    { label: 'Temp', key: 'gpuTemperatureC', color: '#9a9214', description: 'NVIDIA GPU temperature (GPU 0), degrees Celsius', unit: '\u00b0C' },
] as const;

export const SystemMetricsIndicators: React.FC = () => {
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const getMetrics = window.electron?.getSystemMetrics;
        if (!getMetrics) {
            setError('System sensors are available in the Electron desktop app. Restart Electron if this feature was just installed.');
            return;
        }
        let disposed = false;
        let pending = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let lastError = '';
        const poll = async () => {
            if (disposed || pending || document.hidden) return;
            pending = true;
            try {
                const snapshot = await getMetrics();
                if (disposed) return;
                const issues = snapshot.errors.join('\n');
                if (issues && issues !== lastError) console.warn('System sensors:', issues);
                lastError = issues;
                setMetrics(snapshot);
                setError(null);
            } catch (cause) {
                if (disposed) return;
                const message = `System sensor query failed: ${cause instanceof Error ? cause.message : String(cause)}`;
                if (message !== lastError) console.error(message, cause);
                lastError = message;
                setMetrics(null);
                setError(message);
            } finally {
                pending = false;
                if (!disposed && !document.hidden) timer = setTimeout(poll, 1000);
            }
        };
        const onVisibilityChange = () => {
            clearTimeout(timer);
            if (!document.hidden) {
                setMetrics(null);
                void poll();
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        void poll();
        return () => {
            disposed = true;
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, []);

    const detail = error || metrics?.errors.join('\n') || (metrics
        ? `${metrics.gpuName || 'System sensors'}\nUpdated ${new Date(metrics.sampledAt).toLocaleTimeString()}`
        : 'Reading system sensors...');

    return <div role="group" aria-label="Real-time system metrics" className="flex shrink-0 items-center gap-1">
        {indicators.map(indicator => {
            const value = metrics?.[indicator.key] ?? null;
            const text = value === null ? (error || metrics ? 'N/A' : '--') : `${Math.round(value)}${indicator.unit}`;
            return <div key={indicator.key}
                role="meter"
                aria-label={indicator.description}
                aria-valuemin={0}
                aria-valuemax={indicator.unit === '%' ? 100 : 150}
                aria-valuenow={value ?? undefined}
                aria-valuetext={value === null ? `Unavailable. ${detail}` : text}
                title={`${indicator.description}: ${text}\n${detail}`}
                className="relative h-8 w-[60px] overflow-hidden rounded-sm border border-white/10 bg-black/40">
                <div className="absolute inset-y-0 left-0 transition-[width] duration-500" style={{
                    backgroundColor: indicator.color,
                    width: `${value === null ? 0 : Math.max(0, Math.min(100, value))}%`,
                }} />
                <span className="absolute right-1 top-0.5 text-[11px] font-bold leading-none text-white/90">{text}</span>
                <span className="absolute bottom-0.5 left-1 text-[10px] leading-none text-white/80">{indicator.label}</span>
            </div>;
        })}
    </div>;
};
