import React, { useEffect, useRef, useState } from 'react';
import type { CivitaiInventoryItem } from '../services/civitaiService';
import { promptExampleModel, type ModelPromptExample } from '../services/modelPromptExamples';
import { prependGalleryStyleTrigger, removeGalleryStyleTrigger } from '../services/styleGallery';
import { useModelInventory } from './useModelInventory';
import { StyleModal } from './StyleBrowser';

export const ModelPromptExamplesDialog: React.FC<{
    modelName?: string; examples: ModelPromptExample[]; storage: 'sidecar' | 'remote' | null;
    loading: boolean; saving: boolean; error: string;
    onClose: () => void; onSave: () => void; onUse: (example: ModelPromptExample) => void; disabled?: boolean;
}> = ({ modelName, examples, storage, loading, saving, error, onClose, onSave, onUse, disabled }) =>
    <StyleModal title="Model prompt examples" onClose={onClose}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="break-all text-sm text-text-secondary">{modelName}{storage === 'sidecar' ? ' · Saved locally' : ''}</p>
            {storage === 'remote' && examples.length > 0 && <button type="button" onClick={onSave} disabled={saving || disabled}
                className="rounded border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-300 disabled:opacity-50">{saving ? 'Saving...' : 'Save all locally'}</button>}
        </div>
        {loading && <p role="status" className="p-4 text-sm">Loading prompt examples...</p>}
        {error && <p role="alert" className="p-4 text-sm text-red-400">{error}</p>}
        {!loading && !error && !examples.length && <p role="status" className="p-4 text-sm">No prompt examples available.</p>}
        <div className="divide-y divide-border-primary">{!loading && examples.map((example, index) => <div key={`${example.source}-${index}`} className="space-y-3 py-4">
            <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-accent">{example.source === 'archive' ? 'CivArchive' : example.source === 'huggingface' ? 'Hugging Face' : 'Civitai'}</span>
                <button type="button" disabled={disabled || saving} onClick={() => onUse(example)} className="rounded bg-accent px-3 py-2 text-sm font-bold text-accent-text disabled:opacity-50">Use prompt</button>
            </div>
            <div><p className="text-xs font-bold text-text-muted">Positive</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{example.positive}</p></div>
            {example.negative && <div><p className="text-xs font-bold text-text-muted">Negative</p><p className="mt-1 whitespace-pre-wrap break-words text-xs text-text-secondary">{example.negative}</p></div>}
        </div>)}</div>
    </StyleModal>;

export const ModelPromptExamplesButton: React.FC<{
    name: string; linkedPath?: string; disabled: boolean; onUsePrompt: (prompt: string) => void;
}> = ({ name, linkedPath, disabled, onUsePrompt }) => {
    const { inventory, loading: inventoryLoading, error: inventoryError } = useModelInventory();
    const [item, setItem] = useState<CivitaiInventoryItem>();
    const [hasLocal, setHasLocal] = useState(false), [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
    const [examples, setExamples] = useState<ModelPromptExample[]>([]);
    const [storage, setStorage] = useState<'sidecar' | 'remote' | null>(null);
    const [error, setError] = useState('');
    const request = useRef(0);
    useEffect(() => {
        let active = true;
        request.current++;
        setItem(undefined); setHasLocal(false); setOpen(false); setExamples([]); setStorage(null); setLoading(false); setSaving(false); setError('');
        const load = async () => {
            const found = promptExampleModel(inventory, name, linkedPath);
            if (active) setItem(found);
            if (found && window.electron) {
                const local = await window.electron.hasLocalModelPromptExamples(found.path);
                if (active) setHasLocal(local);
            }
        };
        void load().catch(cause => { if (active) setError(`Cannot check LoRA prompts: ${String(cause)}`); });
        return () => { active = false; request.current++; };
    }, [name, linkedPath, inventory]);
    const find = async () => {
        const id = ++request.current;
        setOpen(true); setLoading(true); setExamples([]); setStorage(null); setError('');
        try {
            if (!window.electron) throw new Error('LoRA prompt examples and local saving require the Electron desktop app.');
            if (!item) throw new Error('This LoRA is not in My Library. Index this file in My Library before finding or saving its prompts.');
            const result = await window.electron.getLocalModelPromptExamples({ modelPath: item.path, provider: 'regular', sources: ['civitai', 'archive', 'huggingface'] });
            if (id !== request.current) return;
            setExamples(result.examples); setStorage(result.storage); setHasLocal(result.storage === 'sidecar');
        } catch (cause) { if (id === request.current) setError(String(cause)); }
        finally { if (id === request.current) setLoading(false); }
    };
    const save = async () => {
        const id = request.current;
        setSaving(true); setError('');
        try {
            if (!window.electron || !item) throw new Error('This LoRA must be available in the desktop My Library to save prompts locally.');
            await window.electron.saveLocalModelPromptExamples({ modelPath: item.path, examples });
            if (id === request.current) { setStorage('sidecar'); setHasLocal(true); }
        } catch (cause) { if (id === request.current) setError(String(cause)); }
        finally { if (id === request.current) setSaving(false); }
    };
    const use = (example: ModelPromptExample) => {
        try {
            const triggers = item?.usageMetadata?.triggerWords?.filter(word => word.trim()) || [];
            const body = triggers.reduce((prompt, trigger) => removeGalleryStyleTrigger(prompt, trigger), example.positive);
            onUsePrompt(prependGalleryStyleTrigger(body, triggers.join(', ')));
            setOpen(false);
        } catch (cause) { setError(String(cause)); }
    };
    if (!name.trim() || name === 'None') return null;
    return <div className="space-y-2">
        <button type="button" onClick={() => void find()} disabled={disabled || inventoryLoading || loading || saving}
            className="w-full rounded-md border border-blue-500/60 bg-blue-500/10 px-3 py-2 text-sm font-bold text-blue-300 disabled:opacity-50">
            {hasLocal ? 'Local prompts' : 'Find prompt examples'} · {item?.modelName || name}
        </button>
        {!open && (error || inventoryError) && <p role="alert" className="text-xs text-red-400">{error || inventoryError}</p>}
        {open && <ModelPromptExamplesDialog modelName={item?.modelName || name} examples={examples} storage={storage} loading={loading} saving={saving} error={error}
            onClose={() => { request.current++; setOpen(false); setLoading(false); setSaving(false); }} onSave={() => void save()} onUse={use} disabled={disabled} />}
    </div>;
};
