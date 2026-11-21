// Class names shared by the UI kit. Theme colors only, so every theme and tab accent stays consistent.
const control = 'w-full min-w-0 rounded-md border border-border-primary bg-bg-tertiary p-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50';
const button = 'inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40';

export const ui = {
    label: 'block text-sm font-medium text-text-secondary',
    control,
    hint: 'mt-1 text-xs text-text-muted',
    error: 'mt-1 text-xs text-danger',
    section: 'rounded-xl border border-border-primary p-4',
    buttons: {
        primary: `${button} bg-accent text-accent-text hover:bg-accent-hover`,
        secondary: `${button} border border-border-primary text-text-secondary hover:bg-bg-tertiary hover:text-text-primary`,
        danger: `${button} border border-danger text-danger hover:bg-danger-bg`,
        ghost: `${button} text-text-secondary hover:bg-bg-tertiary hover:text-text-primary`,
    },
};
