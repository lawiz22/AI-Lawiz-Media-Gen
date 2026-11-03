import React, { useMemo, useState } from 'react';
import type { GalleryStyle } from '../services/styleGallery';
import { h3GalleryStyle } from '../services/h3StyleWorkflow';
import { resolveLibraryStyle } from '../services/styleLibrary';
import { StylePicker } from './StyleBrowser';
import { useStyleGallery } from './useStyleGallery';
import { useModelInventory } from './useModelInventory';
import { ModelPromptExamplesButton } from './ModelPromptExamples';

export const VideoPromptStyleControl: React.FC<{
    style?: GalleryStyle; disabled: boolean; active: boolean;
    onSelect: (style: GalleryStyle | undefined) => void; onUsePrompt: (prompt: string) => void;
}> = ({ style, disabled, active, onSelect, onUsePrompt }) => {
    const { gallery, error: galleryError } = useStyleGallery();
    const { inventory, loading, error: inventoryError } = useModelInventory();
    const [error, setError] = useState('');
    const styles = useMemo(() => style && !gallery?.styles.some(value => value.id === style.id)
        ? [...(gallery?.styles || []), style] : gallery?.styles || [], [gallery, style]);
    const select = (selected: GalleryStyle | null) => {
        try {
            const resolved = selected ? resolveLibraryStyle(selected, inventory).style : undefined;
            h3GalleryStyle({ style: resolved });
            onSelect(resolved); setError('');
            return true;
        } catch (cause) { setError(String(cause)); return false; }
    };
    return <section className="space-y-3 rounded-xl border border-sky-400/30 bg-bg-primary p-4">
        <h3 className="font-semibold text-sky-300">Prompt style · H3 / MiniMax</h3>
        <StylePicker styles={styles} inventory={inventory} model="H3" selectedId={style?.id} selectedStyle={style}
            onSelect={select} error={error} disabled={disabled || loading || !active} />
        {(error || galleryError || inventoryError) && <p role="alert" className="text-sm text-red-400">{error || galleryError || inventoryError}</p>}
        {!active ? <p role="status" className="text-xs text-text-muted">H3 style is inactive for LTX Audio-Sync. Your selection is kept for H3 destinations.</p>
            : <p className="text-xs text-text-secondary">The prompt model receives the style name, exact triggers, visual directions and notes. Up to three locally saved LoRA examples are included when available, so their wording can guide the style. These examples are sent to your selected AI provider. No automatic online prompt lookup.</p>}
        {style && active && <>
            <p className="break-all text-xs text-accent">{style.title} · {style.lora || 'Prompt only'}{style.trigger ? ` · Trigger: ${style.trigger}` : ''}</p>
            <p className="text-xs text-text-muted">Send to H3 also selects this style and its LoRA in the destination. Sampling overrides remain controlled by that renderer. Changing style does not rewrite an existing result: regenerate before sending it.</p>
            {style.lora && <ModelPromptExamplesButton name={style.lora} linkedPath={style.libraryLink?.path} disabled={disabled} onUsePrompt={onUsePrompt} />}
        </>}
    </section>;
};
