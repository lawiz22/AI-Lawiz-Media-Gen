import { useCallback, useEffect, useRef } from 'react';

// React.Activity runs effect cleanups when a tab is hidden; only a removed anchor element is a real unmount.
export const useUnmountCleanup = (cleanup: () => void) => {
    const node = useRef<Element | null>(null), latest = useRef(cleanup);
    latest.current = cleanup;
    useEffect(() => () => { if (!node.current?.isConnected) latest.current(); }, []);
    return useCallback((element: Element | null) => { if (element) node.current = element; }, []);
};
