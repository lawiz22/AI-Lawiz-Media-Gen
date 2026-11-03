import React from 'react';
import type { CreationSuiteLive, CreationSuiteSample } from '../services/creationSuiteService';
import { useMediaURL } from './VideoReferenceEditor';

const Curve: React.FC<{ series: { points: CreationSuiteSample[]; color: string }[]; label: string; total?: number }> = ({ series, label, total }) => {
    const available = series.filter(item => item.points.length);
    if (!available.length) return <p className="flex h-24 items-center justify-center text-xs text-text-secondary">Waiting for KJ telemetry...</p>;
    const end = Math.max(1, total || 0, ...available.flatMap(item => item.points.map(point => point.step)));
    return <svg role="img" aria-label={label} viewBox="0 0 300 90" preserveAspectRatio="none" className="h-24 w-full">
        <path d="M5 5V85H295" fill="none" stroke="currentColor" opacity=".2" />
        {available.map(({ points, color }, index) => {
            const min = Math.min(0, ...points.map(point => point.value)), max = Math.max(...points.map(point => point.value));
            const position = (point: CreationSuiteSample) => `${5 + point.step / end * 290},${85 - (point.value - min) / Math.max(max - min, 1e-9) * 80}`;
            const last = position(points[points.length - 1]).split(',');
            return <g key={index}><polyline points={points.map(position).join(' ')} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /><circle cx={last[0]} cy={last[1]} r="2" fill={color} /></g>;
        })}
    </svg>;
};
export const CreationSuiteLivePreview: React.FC<{ live: CreationSuiteLive; showPreview: boolean; showCharts: boolean; running: boolean }> = ({ live, showPreview, showCharts, running }) => {
    const source = useMediaURL(showPreview ? live.preview : undefined);
    const current = live.nodes.find(node => node.id === live.nodeId);
    const sigma = live.sigmas.find(point => point.step === live.step)?.value;
    const delta = live.deltas[live.deltas.length - 1]?.value, stepTime = live.stepTimes[live.stepTimes.length - 1]?.value;
    return <div className="min-w-0 space-y-3 rounded-xl border border-border-primary bg-bg-primary p-3" aria-label="Creation suite live monitor">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <h3 className="font-semibold">{current ? `Node ${current.id} - ${current.title}` : live.phase === 'complete' ? 'Generation complete' : live.phase === 'failed' ? 'Generation failed' : live.phase === 'cancelled' ? 'Generation cancelled' : running ? 'Waiting for ComfyUI...' : 'Live generation monitor'}</h3>
            <span className="text-xs tabular-nums text-text-secondary">{live.step !== undefined ? `${live.step} / ${live.total ?? '?'} steps` : 'No sampling steps yet'}
                {live.width && live.height ? ` - ${live.width} x ${live.height}` : ''}{live.averageStepMs !== undefined ? ` - ${(live.averageStepMs / 1000).toFixed(2)} s/step` : ''}</span>
        </div>
        {showPreview && (source ? <figure><img src={source} alt="Creation suite live generation preview" className="max-h-[480px] w-full rounded-lg object-contain" />
            <figcaption className="mt-2 text-center text-xs text-text-secondary">{Number(live.previewNodeId) < 100 ? 'Scene Creation' : 'Swap face-Change expression'} - live preview</figcaption></figure>
            : <p className="rounded-lg border border-dashed border-border-primary p-6 text-center text-sm text-text-secondary">Live images will appear here while sampling. Keep the model preview patch enabled to receive KJ previews and charts.</p>)}
        {showCharts && <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-lg border border-border-primary p-2"><div className="flex justify-between gap-2 text-xs"><span><span className="text-text-secondary">Sigma</span> / <span className="text-orange-300">Delta</span></span><span className="tabular-nums">{sigma?.toFixed(3) ?? '-'} / {delta?.toFixed(3) ?? '-'}</span></div>
                <Curve label="Sigma and delta over sampling steps" total={live.total} series={[{ points: live.sigmas, color: '#b8bec7' }, { points: live.deltas, color: '#fb923c' }]} />
                <p className="text-[10px] text-text-secondary">Independent vertical scales; horizontal axis: steps.</p></div>
            <div className="min-w-0 rounded-lg border border-border-primary p-2"><div className="flex justify-between gap-2 text-xs"><span>Step time (s)</span><span className="tabular-nums">{stepTime === undefined ? '-' : `${stepTime.toFixed(2)} s`}</span></div>
                <Curve label="Step time in seconds over sampling steps" total={live.total} series={[{ points: live.stepTimes, color: '#a3e635' }]} />
                <p className="text-[10px] text-text-secondary">Server measurements, up to 256 recent samples.</p></div>
        </div>}
        <details><summary className="cursor-pointer text-xs font-semibold">Workflow nodes ({live.nodes.filter(node => node.state === 'done' || node.state === 'cached').length}/{live.nodes.length})</summary>
            <div className="mt-2 max-h-64 space-y-1 overflow-auto text-xs">{live.nodes.length ? live.nodes.map(node => <div key={node.id} className={`grid grid-cols-[2rem_minmax(0,1fr)_4rem] gap-2 rounded p-1 ${node.state === 'running' ? 'bg-lime-300/10 text-lime-200' : 'text-text-secondary'}`}>
                <span>{node.id}</span><span className="min-w-0 break-words">{node.title}<span className="block opacity-70">{node.classType}</span></span><span>{node.state}</span>
            </div>) : <p>The active graph will appear when generation starts.</p>}</div>
        </details>
    </div>;
};
