import React from 'react';
import { createAccentStyle } from '../utils/accentTheme';
import PhotoFusionPanel from './photoFusion/PhotoFusionPanel';
import PastForwardPanel from './pastForward/PastForwardPanel';
import StyliseAnythingPanel from './StyliseAnythingPanel';
import SwapAnythingPanel from './SwapAnythingPanel';
import SwapPersonPanel from './SwapPersonPanel';
import { EnhanceIcon, GroupPhotoFusionIcon, PastForwardIcon, SwatchIcon } from './icons';
import { TabActivity } from './TabActivity';

export type FunSubTab = 'photo-fusion' | 'past-forward' | 'swap-anything' | 'swap-person' | 'stylise-anything';

const SUB_TABS: Array<{ id: FunSubTab; label: string; Icon: React.FC<{ className?: string }>; selected: string; hover: string; accent: React.CSSProperties }> = [
    { id: 'photo-fusion', label: 'Photo Fusion', Icon: GroupPhotoFusionIcon, selected: 'bg-rose-500 text-black light:bg-rose-700 light:text-white', hover: 'hover:text-rose-300', accent: createAccentStyle('#fb7185', '#fda4af', '#e11d48') },
    { id: 'past-forward', label: 'Past Forward', Icon: PastForwardIcon, selected: 'bg-cyan-500 text-black light:bg-cyan-700 light:text-white', hover: 'hover:text-cyan-300', accent: createAccentStyle('#22d3ee', '#67e8f9', '#0891b2') },
    { id: 'swap-anything', label: 'Swap Anything', Icon: EnhanceIcon, selected: 'bg-amber-500 text-black', hover: 'hover:text-amber-300', accent: createAccentStyle('#f59e0b', '#fbbf24', '#d97706') },
    { id: 'swap-person', label: 'Swap a Person', Icon: GroupPhotoFusionIcon, selected: 'bg-rose-500 text-black light:bg-rose-700 light:text-white', hover: 'hover:text-rose-300', accent: createAccentStyle('#fb7185', '#fda4af', '#e11d48') },
    { id: 'stylise-anything', label: 'Stylise Anything', Icon: SwatchIcon, selected: 'bg-emerald-500 text-black', hover: 'hover:text-emerald-300', accent: createAccentStyle('#34d399', '#6ee7b7', '#059669') },
];

/** The Fun tab: its sub-tab bar and its five panels, each kept mounted. */
export const FunTab: React.FC<{
    active: boolean;
    subTab: FunSubTab;
    onSubTabChange: (subTab: FunSubTab) => void;
    /** Changes when the tab is reset: every panel then starts over. */
    resetVersion: number;
    isComfyUIConnected: boolean;
    comfyUIObjectInfo: any | null;
}> = ({ active, subTab, onSubTabChange, resetVersion, isComfyUIConnected, comfyUIObjectInfo }) => {
    const comfy = { isComfyUIConnected, comfyUIObjectInfo };
    const panels: Record<FunSubTab, React.ReactNode> = {
        'photo-fusion': <PhotoFusionPanel />,
        'past-forward': <PastForwardPanel />,
        'swap-anything': <SwapAnythingPanel {...comfy} />,
        'swap-person': <SwapPersonPanel {...comfy} />,
        'stylise-anything': <StyliseAnythingPanel {...comfy} />,
    };
    return <>
        {active && <div className="mb-4 flex justify-center"><div className="inline-flex flex-wrap rounded-md border border-rose-400/40 bg-bg-secondary p-1 shadow-sm">
            {SUB_TABS.map(tab => <button key={tab.id} type="button" onClick={() => onSubTabChange(tab.id)}
                className={`flex items-center gap-2 rounded px-4 py-2 text-sm font-bold transition-colors ${subTab === tab.id ? tab.selected : `text-text-secondary hover:bg-bg-tertiary ${tab.hover}`}`}>
                <tab.Icon className="h-4 w-4" />{tab.label}
            </button>)}
        </div></div>}
        {SUB_TABS.map(tab => <React.Fragment key={tab.id}><TabActivity mode={active && subTab === tab.id ? 'visible' : 'hidden'}>
            <div key={`${tab.id}-${resetVersion}`} style={tab.accent}>{panels[tab.id]}</div>
        </TabActivity></React.Fragment>)}
    </>;
};
