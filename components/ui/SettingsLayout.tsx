import React from 'react';
import { Accordion } from './Accordion';

type Section = React.ReactNode | (() => React.ReactNode);

/** Standard workflow layout: settings on the left in a fixed order, prompt, Generate and results on the right. */
export const SettingsLayout: React.FC<{
    /** Workflow name, used for the accessible names of both columns. */
    label: string;
    disabled?: boolean;
    /** Inputs shown above the sections, e.g. the source image. */
    top?: React.ReactNode;
    models?: Section;
    loras?: Section;
    sampler?: Section;
    advanced?: Section;
    /** Buttons shown under the sections, e.g. Check workflow or Export API. */
    actions?: React.ReactNode;
    children: React.ReactNode;
}> = ({ label, disabled, top, models, loras, sampler, advanced, actions, children }) =>
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <aside aria-label={`${label} options`} className="order-2 min-w-0 lg:order-1">
            <fieldset disabled={disabled} className="min-w-0 space-y-4 disabled:opacity-60">
                {top}
                {models && <Accordion title="Models" defaultOpen>{models}</Accordion>}
                {loras && <Accordion title="LoRAs">{loras}</Accordion>}
                {sampler && <Accordion title="Sampler">{sampler}</Accordion>}
                {advanced && <Accordion title="Advanced">{advanced}</Accordion>}
                {actions}
            </fieldset>
        </aside>
        <div aria-label={`${label} prompt and results`} className="order-1 min-w-0 space-y-4 lg:order-2">{children}</div>
    </div>;
