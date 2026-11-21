import React, { useState } from 'react';
import { ui } from './styles';

/** Collapsible settings section. Its content is mounted only while it is open. */
export const Accordion: React.FC<{
    title: React.ReactNode;
    children: React.ReactNode | (() => React.ReactNode);
    defaultOpen?: boolean;
    className?: string;
}> = ({ title, children, defaultOpen = false, className = '' }) => {
    const [open, setOpen] = useState(defaultOpen);
    return <details open={open} className={`${ui.section} ${className}`} onToggle={event => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer select-none font-semibold text-text-primary">{title}</summary>
        {open && <div className="mt-4 space-y-4">{typeof children === 'function' ? children() : children}</div>}
    </details>;
};
