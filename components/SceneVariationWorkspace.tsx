import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store/store';
import type { LibraryItem } from '../types';
import SceneVariationPanel from './SceneVariationPanel';
import CharacterScenePanel from './CharacterScenePanel';
import { CreationSuitePanel } from './CreationSuitePanel';
import { ClothesSwitcherPanel } from './ClothesSwitcherPanel';

interface Props { isComfyUIConnected: boolean | null; comfyUIObjectInfo: any; onModelChange: (model: string) => void; pendingPreset?: LibraryItem | null; onPresetLoaded?: () => void }
const SceneVariationWorkspace: React.FC<Props> = props => {
    const [active, setActive] = useState<'variation' | 'character-scene' | 'creation-suite' | 'clothes-switcher'>('variation');
    const [creationOpened, setCreationOpened] = useState(false);
    const [clothesOpened, setClothesOpened] = useState(false);
    const [variationModel, setVariationModel] = useState('');
    const [characterModel, setCharacterModel] = useState('Qwen Image 2.1 - Character in a Scene');
    const [creationModel, setCreationModel] = useState('Creation suite');
    const [clothesModel, setClothesModel] = useState('Clothes Switcher');
    const busy = useSelector((state: RootState) => state.generation.isLoading);
    useEffect(() => { props.onModelChange(active === 'variation' ? variationModel : active === 'character-scene' ? characterModel : active === 'creation-suite' ? creationModel : clothesModel); }, [active, variationModel, characterModel, creationModel, clothesModel, props.onModelChange]);
    useEffect(() => {
        if (!props.pendingPreset) return;
        if (props.pendingPreset.clothesSwitcherOptions) { setClothesOpened(true); setActive('clothes-switcher'); }
        else if (props.pendingPreset.creationSuiteOptions) { setCreationOpened(true); setActive('creation-suite'); }
        else setActive('variation');
    }, [props.pendingPreset]);
    return <div className="space-y-5">
        <div role="tablist" aria-label="Scene Variation workflow" className="flex gap-4 overflow-x-auto border-b border-border-primary">
            {(['variation', 'character-scene', 'creation-suite', 'clothes-switcher'] as const).map(tab => <button type="button" role="tab" key={tab} aria-selected={active === tab} disabled={busy}
                onClick={() => { if (tab === 'creation-suite') setCreationOpened(true); if (tab === 'clothes-switcher') setClothesOpened(true); setActive(tab); }}
                className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-semibold ${active === tab ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>
                {tab === 'variation' ? 'Scene Variation' : tab === 'character-scene' ? 'Character in a Scene' : tab === 'creation-suite' ? 'Creation suite' : 'Clothes Switcher'}
            </button>)}
        </div>
        <React.Activity mode={active === 'variation' ? 'visible' : 'hidden'}>
            <SceneVariationPanel {...props} pendingPreset={props.pendingPreset?.creationSuiteOptions || props.pendingPreset?.clothesSwitcherOptions ? null : props.pendingPreset} onModelChange={setVariationModel} />
        </React.Activity>
        <React.Activity mode={active === 'character-scene' ? 'visible' : 'hidden'}>
            <CharacterScenePanel isComfyUIConnected={props.isComfyUIConnected} objectInfo={props.comfyUIObjectInfo} onModelChange={setCharacterModel} />
        </React.Activity>
        <React.Activity mode={active === 'creation-suite' ? 'visible' : 'hidden'}>
            {creationOpened && <CreationSuitePanel isComfyUIConnected={props.isComfyUIConnected} onModelChange={setCreationModel} pendingPreset={props.pendingPreset} onPresetLoaded={props.onPresetLoaded} />}
        </React.Activity>
        <React.Activity mode={active === 'clothes-switcher' ? 'visible' : 'hidden'}>
            {clothesOpened && <ClothesSwitcherPanel isComfyUIConnected={props.isComfyUIConnected} onModelChange={setClothesModel} pendingPreset={props.pendingPreset} onPresetLoaded={props.onPresetLoaded} />}
        </React.Activity>
    </div>;
};
export default SceneVariationWorkspace;