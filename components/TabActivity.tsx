import React from 'react';

type Mode = 'visible' | 'hidden';
type Props = { mode: Mode; children?: React.ReactNode };

const resetKey = (children: React.ReactNode) => React.isValidElement(children) ? children.key : null;

// A tab that stays hidden keeps its last render and catches up when shown; a reset (new key) still applies at once.
const KeptWhileHidden = React.memo(
    ({ children }: Props) => <>{children}</>,
    (previous, next) => previous.mode === 'hidden' && next.mode === 'hidden' && resetKey(previous.children) === resetKey(next.children),
);

export const TabActivity = ({ mode, children }: Props) => (
    <React.Activity mode={mode}><KeptWhileHidden mode={mode}>{children}</KeptWhileHidden></React.Activity>
);
