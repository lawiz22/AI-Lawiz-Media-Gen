import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckIcon, CloseIcon, RefreshIcon, SpinnerIcon, WarningIcon, WorkflowIcon } from './icons';
import { runInstallationDiagnostics, type DiagnosticStatus, type InstallationReport } from '../services/installationDiagnostics';

interface InstallationDashboardModalProps {
    isOpen: boolean;
    onClose: () => void;
    geminiConfigured: boolean;
    mammouthKey: string;
    ollamaUrl: string;
}

type ViewId = 'overview' | 'features' | 'nodes' | 'models';

const PROVIDER_LOGOS: Record<string, string> = {
    ollama: 'https://ollama.com/public/ollama.png',
    gemini: 'https://mammouth.ai/logos/gemini.svg',
    comfyui: 'https://www.comfy.org/favicon.ico',
    mammouth: 'https://mammouth.ai/logos/mammouth-ai-logo.svg',
    drive: 'https://fonts.gstatic.com/s/i/productlogos/drive_2020q4/v8/web-96dp/logo_drive_2020q4_color_2x_web_96dp.png',
};

const statusStyle: Record<DiagnosticStatus, string> = {
    ready: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
    missing: 'border-red-500/50 bg-red-500/10 text-red-300',
};

const StatusMark: React.FC<{ status: DiagnosticStatus | boolean; label?: string }> = ({ status, label }) => {
    const resolved = typeof status === 'boolean' ? (status ? 'ready' : 'missing') : status;
    return <span className={`inline-flex shrink-0 items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold uppercase ${statusStyle[resolved]}`}>
        {resolved === 'ready' ? <CheckIcon className="h-3.5 w-3.5" /> : resolved === 'warning' ? <WarningIcon className="h-3.5 w-3.5" /> : <CloseIcon className="h-3.5 w-3.5" />}
        {label || (resolved === 'ready' ? 'Ready' : resolved === 'warning' ? 'Partial' : 'Missing')}
    </span>;
};

const ProviderLogo: React.FC<{ id: string; name: string }> = ({ id, name }) => {
    const [failed, setFailed] = useState(false);
    return <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-primary bg-white p-1">
        {!failed && PROVIDER_LOGOS[id]
            ? <img src={PROVIDER_LOGOS[id]} alt={`${name} logo`} className="h-full w-full object-contain" onError={() => setFailed(true)} />
            : <span className="text-sm font-black text-black">{name.slice(0, 2).toUpperCase()}</span>}
    </div>;
};

const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="border border-dashed border-border-primary px-4 py-8 text-center text-sm text-text-muted">{children}</div>
);

export const InstallationDashboardModal: React.FC<InstallationDashboardModalProps> = ({ isOpen, onClose, geminiConfigured, mammouthKey, ollamaUrl }) => {
    const [report, setReport] = useState<InstallationReport | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [view, setView] = useState<ViewId>('overview');
    const [problemsOnly, setProblemsOnly] = useState(false);
    const [query, setQuery] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    const refresh = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            setReport(await runInstallationDiagnostics({ geminiConfigured, mammouthKey, ollamaUrl }));
        } catch (diagnosticError) {
            setError(diagnosticError instanceof Error ? diagnosticError.message : 'Diagnostics could not be completed.');
        } finally {
            setIsLoading(false);
        }
    }, [geminiConfigured, mammouthKey, ollamaUrl]);

    useEffect(() => {
        if (isOpen) void refresh();
    }, [isOpen, refresh]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const featureGroups = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const features = (report?.features || []).filter(feature => {
            if (problemsOnly && feature.status === 'ready') return false;
            return !normalizedQuery || `${feature.group} ${feature.name} ${feature.detail} ${feature.requirements.map(item => item.label).join(' ')}`.toLowerCase().includes(normalizedQuery);
        });
        return Object.entries(features.reduce<Record<string, typeof features>>((groups, feature) => {
            (groups[feature.group] ||= []).push(feature);
            return groups;
        }, {}));
    }, [problemsOnly, query, report]);

    const nodeGroups = useMemo(() => Object.entries((report?.comfy.nodes || []).reduce<Record<string, InstallationReport['comfy']['nodes']>>((groups, node) => {
        if (problemsOnly && node.installed) return groups;
        if (query && !`${node.pack} ${node.name}`.toLowerCase().includes(query.toLowerCase())) return groups;
        (groups[node.pack] ||= []).push(node);
        return groups;
    }, {})), [problemsOnly, query, report]);

    if (!isOpen) return null;

    const readyCount = report?.features.filter(feature => feature.status === 'ready').length || 0;
    const issueCount = (report?.features.length || 0) - readyCount;
    const installedNodes = report?.comfy.nodes.filter(node => node.installed).length || 0;
    const inventory = report?.comfy.inventory;

    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="installation-dashboard-title" onClick={onClose}>
        <div className="flex max-h-[96vh] w-full max-w-7xl flex-col overflow-hidden rounded-md border border-border-primary bg-bg-secondary shadow-2xl" onClick={event => event.stopPropagation()}>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-primary px-4 py-3 sm:px-6">
                <div className="min-w-0">
                    <h2 id="installation-dashboard-title" className="flex items-center gap-2 text-lg font-bold text-text-primary"><WorkflowIcon className="h-5 w-5 text-accent" />What&apos;s installed</h2>
                    <p className="text-xs text-text-muted">Backends, ComfyUI nodes, models and feature readiness</p>
                </div>
                <div className="flex items-center gap-2">
                    {report && <span className="hidden text-[10px] text-text-muted md:inline">Checked {new Date(report.checkedAt).toLocaleTimeString()}</span>}
                    <button type="button" onClick={() => void refresh()} disabled={isLoading} title="Refresh all diagnostics" className="rounded-md border border-border-primary bg-bg-tertiary p-2 text-text-secondary hover:text-accent disabled:opacity-50"><RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /></button>
                    <button type="button" onClick={onClose} title="Close" className="rounded-md border border-border-primary bg-bg-tertiary p-2 text-text-secondary hover:text-text-primary"><CloseIcon className="h-4 w-4" /></button>
                </div>
            </header>

            <div className="grid grid-cols-2 border-b border-border-primary bg-bg-primary sm:grid-cols-4">
                {([
                    ['overview', 'Overview'], ['features', `Features ${report ? `(${readyCount}/${report.features.length})` : ''}`],
                    ['nodes', `ComfyUI Nodes ${report ? `(${installedNodes}/${report.comfy.nodes.length})` : ''}`], ['models', 'Models'],
                ] as Array<[ViewId, string]>).map(([id, label]) => <button key={id} type="button" onClick={() => setView(id)} className={`border-b-2 px-3 py-3 text-xs font-bold ${view === id ? 'border-accent bg-bg-tertiary text-accent' : 'border-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'}`}>{label}</button>)}
            </div>

            {(view === 'features' || view === 'nodes') && <div className="flex flex-col gap-2 border-b border-border-primary px-4 py-3 sm:flex-row sm:items-center sm:px-6">
                <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${view}...`} className="h-9 min-w-0 flex-1 rounded-md border border-border-primary bg-bg-primary px-3 text-sm outline-none focus:border-accent" />
                <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border-primary bg-bg-tertiary px-3 text-xs font-semibold text-text-secondary"><input type="checkbox" checked={problemsOnly} onChange={event => setProblemsOnly(event.target.checked)} className="accent-accent" />Problems only</label>
            </div>}

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                {isLoading && !report && <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-text-secondary"><SpinnerIcon className="h-9 w-9 animate-spin text-accent" /><span className="text-sm">Checking every backend and ComfyUI capability...</span></div>}
                {error && <div className="border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

                {report && view === 'overview' && <div className="space-y-6">
                    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border-primary bg-border-primary lg:grid-cols-4">
                        <div className="bg-bg-primary p-4"><div className="text-2xl font-black text-emerald-400">{readyCount}</div><div className="text-xs text-text-muted">Features ready</div></div>
                        <div className="bg-bg-primary p-4"><div className={`text-2xl font-black ${issueCount ? 'text-amber-400' : 'text-emerald-400'}`}>{issueCount}</div><div className="text-xs text-text-muted">Need attention</div></div>
                        <div className="bg-bg-primary p-4"><div className="text-2xl font-black text-accent">{installedNodes}/{report.comfy.nodes.length}</div><div className="text-xs text-text-muted">Required nodes loaded</div></div>
                        <div className="bg-bg-primary p-4"><div className="text-2xl font-black text-text-primary">{report.backends.filter(backend => backend.connected).length}/{report.backends.length}</div><div className="text-xs text-text-muted">Backends connected</div></div>
                    </section>

                    <section>
                        <h3 className="mb-2 text-xs font-bold uppercase text-text-muted">Backends</h3>
                        <div className="divide-y divide-border-primary border-y border-border-primary">
                            {report.backends.map(backend => <div key={backend.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center">
                                <div className="flex min-w-0 flex-1 items-center gap-3"><ProviderLogo id={backend.id} name={backend.name} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="font-bold text-text-primary">{backend.name}</h4>{backend.version && <span className="font-mono text-xs text-accent">v{backend.version}</span>}</div><p className="mt-1 text-xs text-text-muted">{backend.message}</p>{backend.models.length > 0 && <p className="mt-1 text-xs text-text-secondary">{backend.models.length} accessible model{backend.models.length === 1 ? '' : 's'}</p>}</div></div>
                                <StatusMark status={backend.connected} label={backend.connected ? 'Connected' : backend.configured ? 'Unavailable' : 'Not configured'} />
                            </div>)}
                        </div>
                    </section>

                    <section>
                        <h3 className="mb-2 text-xs font-bold uppercase text-text-muted">ComfyUI installation</h3>
                        <div className="grid gap-px overflow-hidden rounded-md border border-border-primary bg-border-primary sm:grid-cols-2 lg:grid-cols-5">
                            {[
                                ['ComfyUI', report.comfy.version || 'Unknown'], ['Manager', report.comfy.managerVersion || 'Not detected'],
                                ['Python', report.comfy.pythonVersion || 'Unknown'], ['PyTorch', report.comfy.pytorchVersion || 'Unknown'], ['Device', report.comfy.device || 'Unknown'],
                            ].map(([label, value]) => <div key={label} className="min-w-0 bg-bg-primary p-3"><div className="text-[10px] font-bold uppercase text-text-muted">{label}</div><div className="mt-1 truncate text-xs font-semibold text-text-primary" title={value}>{value}</div></div>)}
                        </div>
                    </section>
                </div>}

                {report && view === 'features' && <div className="space-y-3">
                    {featureGroups.length === 0 && <EmptyState>No matching features.</EmptyState>}
                    {featureGroups.map(([group, features]) => {
                        const groupReady = features.filter(feature => feature.status === 'ready').length;
                        const expanded = expandedGroups[group] !== false;
                        return <section key={group} className="overflow-hidden rounded-md border border-border-primary">
                            <button type="button" onClick={() => setExpandedGroups(current => ({ ...current, [group]: !expanded }))} className="flex w-full items-center justify-between gap-3 bg-bg-primary px-4 py-3 text-left"><span className="font-bold text-text-primary">{group}</span><span className="text-xs text-text-muted">{groupReady}/{features.length} ready</span></button>
                            {expanded && <div className="divide-y divide-border-primary">{features.map(feature => <details key={feature.name} className="group px-4 py-3">
                                <summary className="flex cursor-pointer list-none items-start justify-between gap-3"><div><h4 className="text-sm font-bold text-text-primary">{feature.name}</h4><p className="mt-1 text-xs text-text-muted">{feature.detail}</p></div><StatusMark status={feature.status} /></summary>
                                <div className="mt-3 grid gap-1 border-t border-border-primary pt-3 sm:grid-cols-2">{feature.requirements.map(requirement => <div key={requirement.label} className={`flex items-center gap-2 text-xs ${requirement.met ? 'text-emerald-300' : 'text-red-300'}`}>{requirement.met ? <CheckIcon className="h-4 w-4 shrink-0" /> : <CloseIcon className="h-4 w-4 shrink-0" />}<span>{requirement.label}</span></div>)}</div>
                            </details>)}</div>}
                        </section>;
                    })}
                </div>}

                {report && view === 'nodes' && <div className="space-y-3">
                    {nodeGroups.length === 0 && <EmptyState>No matching nodes.</EmptyState>}
                    {nodeGroups.map(([pack, nodes]) => {
                        const count = nodes.filter(node => node.installed).length;
                        return <details key={pack} open={pack !== 'ComfyUI core / comfy_extras'} className="overflow-hidden rounded-md border border-border-primary">
                            <summary className="flex cursor-pointer list-none items-center justify-between bg-bg-primary px-4 py-3"><span className="text-sm font-bold text-text-primary">{pack}</span><StatusMark status={count === nodes.length ? 'ready' : count > 0 ? 'warning' : 'missing'} label={`${count}/${nodes.length}`} /></summary>
                            <div className="grid gap-px border-t border-border-primary bg-border-primary sm:grid-cols-2 lg:grid-cols-3">{nodes.map(node => <div key={node.name} className={`flex items-center gap-2 bg-bg-secondary px-3 py-2 text-xs ${node.installed ? 'text-emerald-300' : 'text-red-300'}`}>{node.installed ? <CheckIcon className="h-4 w-4 shrink-0" /> : <CloseIcon className="h-4 w-4 shrink-0" />}<span className="break-all font-mono">{node.name}</span></div>)}</div>
                        </details>;
                    })}
                </div>}

                {report && view === 'models' && <div className="space-y-4">
                    {inventory && Object.entries({
                        'Checkpoints': inventory.checkpoints, 'Diffusion / UNET models': inventory.diffusionModels,
                        'Text encoders': inventory.textEncoders, 'VAEs': inventory.vaes, 'LoRAs': inventory.loras,
                        'Upscale models': inventory.upscaleModels, 'Latent upscale models': inventory.latentUpscaleModels,
                        'SeedVR2 DiT models': inventory.seedVrDitModels, 'SeedVR2 VAE models': inventory.seedVrVaeModels,
                    }).map(([label, models]) => <details key={label} open={models.length > 0 && models.length < 12} className="overflow-hidden rounded-md border border-border-primary">
                        <summary className="flex cursor-pointer list-none items-center justify-between bg-bg-primary px-4 py-3"><span className="text-sm font-bold text-text-primary">{label}</span><span className="text-xs font-bold text-accent">{models.length}</span></summary>
                        {models.length > 0 ? <div className="grid gap-px border-t border-border-primary bg-border-primary sm:grid-cols-2">{models.map(model => <div key={model} className="break-all bg-bg-secondary px-3 py-2 font-mono text-xs text-text-secondary">{model}</div>)}</div> : <div className="border-t border-border-primary px-4 py-5 text-xs text-text-muted">No model exposed by ComfyUI for this category.</div>}
                    </details>)}
                </div>}
            </div>
        </div>
    </div>;
};