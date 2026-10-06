import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store/store';
import type { LibraryItem } from '../types';
import SceneVariationPanel from './SceneVariationPanel';
import CharacterScenePanel from './CharacterScenePanel';

interface Props { isComfyUIConnected: boolean | null; comfyUIObjectInfo: any; onModelChange: (model: string) => void; pendingPreset?: LibraryItem | null; onPresetLoaded?: () => void }
const SceneVariationWorkspace: React.FC<Props> = props => {
    const [active, setActive] = useState<'variation' | 'character-scene'>('variation');
    const [variationModel, setVariationModel] = useState('');
    const [characterModel, setCharacterModel] = useState('Qwen Image 2.1 - Character in a Scene');
    const busy = useSelector((state: RootState) => state.generation.isLoading);
    useEffect(() => { props.onModelChange(active === 'variation' ? variationModel : characterModel); }, [active, variationModel, characterModel, props.onModelChange]);
    useEffect(() => { if (props.pendingPreset) setActive('variation'); }, [props.pendingPreset]);
    return <div className="space-y-5"><div role="tablist" aria-label="Scene Variation workflow" className="flex gap-4 overflow-x-auto border-b border-border-primary">{(['variation', 'character-scene'] as const).map(tab => <button type="button" role="tab" key={tab} aria-selected={active === tab} disabled={busy} onClick={() => setActive(tab)} className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-semibold ${active === tab ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>{tab === 'variation' ? 'Scene Variation' : 'Character in a Scene'}</button>)}</div><React.Activity mode={active === 'variation' ? 'visible' : 'hidden'}><SceneVariationPanel {...props} onModelChange={setVariationModel} /></React.Activity><React.Activity mode={active === 'character-scene' ? 'visible' : 'hidden'}><CharacterScenePanel isComfyUIConnected={props.isComfyUIConnected} objectInfo={props.comfyUIObjectInfo} onModelChange={setCharacterModel} /></React.Activity></div>;
};
export default SceneVariationWorkspace;