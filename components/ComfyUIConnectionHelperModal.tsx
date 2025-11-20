import React, { useState, useEffect } from 'react';
import { CloseIcon, WarningIcon, CopyIcon, SpinnerIcon } from './icons';

interface ComfyUIConnectionHelperModalProps {
  isOpen: boolean;
  onClose: () => void;
  testedUrl: string;
}

const CopyableField: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      <label className="block text-sm font-bold text-text-secondary">{label}</label>
      <div className="flex items-center gap-2 mt-1">
        <code className="block w-full bg-bg-primary border-border-primary border rounded-md p-2 text-xs truncate text-text-secondary" title={value}>
          {value || 'Not available'}
        </code>
        <button
          onClick={handleCopy}
          disabled={!value}
          className="flex-shrink-0 bg-bg-tertiary text-text-secondary font-semibold py-2 px-3 rounded-lg hover:bg-bg-tertiary-hover transition-colors disabled:opacity-50"
        >
          {copied ? 'Copied!' : <CopyIcon className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
};

const WizardStep: React.FC<{ step: number; title: string; children: React.ReactNode }> = ({ step, title, children }) => (
    <div className="border-l-4 border-border-primary pl-4 py-2">
        <h3 className="text-md font-bold text-text-primary">
            <span className="bg-accent text-accent-text rounded-full h-6 w-6 inline-flex items-center justify-center mr-2 text-sm">{step}</span>
            {title}
        </h3>
        <div className="mt-2 text-sm text-text-secondary space-y-3">
            {children}
        </div>
    </div>
);

export const ComfyUIConnectionHelperModal: React.FC<ComfyUIConnectionHelperModalProps> = ({ isOpen, onClose, testedUrl }) => {
    const [lnaStatus, setLnaStatus] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        if (isOpen) {
            setIsChecking(true);
            // The 'local-network-access' permission is not standard in TS libs yet, hence 'as any'
            const permissionName = 'local-network-access' as any;

            if ('permissions' in navigator && 'query' in navigator.permissions) {
                navigator.permissions.query({ name: permissionName })
                    .then(status => {
                        setLnaStatus(status.state);
                        // Listen for changes, e.g., if the user changes settings while the modal is open
                        status.onchange = () => setLnaStatus(status.state);
                    })
                    .catch((err) => {
                        console.warn("Could not query for 'local-network-access' permission.", err);
                        setLnaStatus('unknown');
                    })
                    .finally(() => setIsChecking(false));
            } else {
                console.warn("'navigator.permissions.query' is not supported in this browser.");
                setLnaStatus('unknown');
                setIsChecking(false);
            }
        }
    }, [isOpen]);

  const renderLnaStatus = () => {
    if (isChecking) {
        return <div className="flex items-center gap-2"><SpinnerIcon className="w-4 h-4 animate-spin" /><span>Checking permission status...</span></div>;
    }
    switch (lnaStatus) {
        case 'granted':
            return <p className="font-bold text-green-400">Status: GRANTED</p>;
        case 'denied':
            return <p className="font-bold text-danger">Status: DENIED</p>;
        case 'prompt':
            return <p className="font-bold text-highlight-yellow">Status: REQUIRES PROMPT</p>;
        default:
            return <p className="font-bold text-text-muted">Status: UNKNOWN / NOT SUPPORTED</p>;
    }
  };

  const renderLnaInstructions = () => {
    switch (lnaStatus) {
        case 'granted':
            return <p>Your browser has the necessary permission. The connection should work. If it still fails, please check the CORS and URL steps below.</p>;
        case 'denied':
            return (
                <div className="space-y-2">
                    <p className="font-bold text-highlight-yellow">Your browser is actively blocking the connection.</p>
                    <p>You must manually change this setting. In Chrome/Edge:</p>
                    <ol className="list-decimal list-inside pl-4 text-xs space-y-1">
                        <li>Click the lock icon 🔒 next to the address bar.</li>
                        <li>Go to "Site settings".</li>
                        <li>Find the setting called "Insecure content".</li>
                        <li>Change it from "Block" to "Allow".</li>
                        <li>Reload this page and try connecting again.</li>
                    </ol>
                </div>
            );
        case 'prompt':
            return (
                <div className="space-y-2">
                    <p className="font-bold text-highlight-yellow">Your browser will ask for your permission.</p>
                    <p>When you click "Test Connection" or try to generate, a small pop-up will appear near your address bar. <strong className="text-text-primary">You must click "Allow"</strong> for the connection to succeed.</p>
                </div>
            );
        default:
            return <p>Your browser might not support this new security feature, or we couldn't check the status. If the connection fails, please ensure you have completed the CORS step below.</p>;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="comfy-helper-title"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary w-full max-w-3xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[95vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 id="comfy-helper-title" className="text-xl font-bold text-accent flex items-center gap-3">
            <WarningIcon className="w-6 h-6" />
            ComfyUI Connection Troubleshooting
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-text-secondary hover:bg-bg-tertiary-hover"
            aria-label="Close"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-6">
            <WizardStep step={1} title="Check Private Network Access Permission">
                <p>
                    Modern browsers require explicit permission for a website (like this app) to connect to a server on your local network (like ComfyUI). This is the most common reason for connection failure.
                </p>
                <div className="mt-3 p-3 bg-bg-primary/50 rounded-lg border border-border-primary space-y-2">
                    {renderLnaStatus()}
                    <div className="text-sm">{renderLnaInstructions()}</div>
                </div>
            </WizardStep>

            <WizardStep step={2} title="Confirm CORS Flag is Enabled">
                <p>
                   If the permission above is granted but the connection still fails, the next most likely reason is CORS. You <strong className="text-highlight-yellow">must</strong> start your ComfyUI server with a special flag.
                </p>
                <div className="mt-2 p-3 bg-bg-primary/50 rounded-lg border border-border-primary text-sm space-y-4">
                    <p>In your ComfyUI startup script (e.g., `run_nvidia_gpu.bat`), find the line <code className="text-xs">COMMANDLINE_ARGS=</code> and add <code className="text-xs text-highlight-green">--enable-cors</code>.</p>
                    <pre className="bg-bg-secondary p-2 rounded-md text-xs text-text-secondary whitespace-pre-wrap font-mono"><code>COMMANDLINE_ARGS=--enable-cors</code></pre>
                    <p className="font-bold text-highlight-yellow">You MUST restart your ComfyUI server after saving the file for this change to take effect.</p>
                </div>
            </WizardStep>
            
            <WizardStep step={3} title="Verify URL and Server Status">
                <p>Finally, let's make sure the URL is correct and the server is running.</p>
                <ul className="list-disc list-inside space-y-2 mt-2 pl-2">
                    <li>Check your ComfyUI terminal window to see which address it's running on.</li>
                    <li>The URL we last tried to connect to is:</li>
                </ul>
                <div className="mt-2 p-3 bg-bg-primary/50 rounded-lg border border-border-primary space-y-2">
                    <CopyableField label="URL We Tested:" value={testedUrl} />
                    <a href={testedUrl} target="_blank" rel="noopener noreferrer" className="inline-block w-full text-center bg-accent text-accent-text font-bold py-2 px-4 rounded-lg hover:bg-accent-hover transition-colors">
                        Click to Open URL in New Tab
                    </a>
                </div>
                <p className="mt-2"><strong className="text-highlight-yellow">If that link doesn't open ComfyUI,</strong> your URL is incorrect in the app's Settings, or the server isn't running.</p>
            </WizardStep>

        </div>

        <div className="flex justify-end pt-6 mt-4 border-t border-border-primary flex-shrink-0">
            <button
                onClick={onClose}
                className="w-full sm:w-auto bg-accent text-accent-text font-bold py-2 px-6 rounded-lg hover:bg-accent-hover transition-colors"
            >
                OK
            </button>
        </div>
      </div>
    </div>
  );
};
