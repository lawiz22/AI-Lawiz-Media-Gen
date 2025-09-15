import React from 'react';
import { CloseIcon, WarningIcon, CopyIcon } from './icons';

interface OAuthHelperModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  clientId: string;
  origin: string;
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

export const OAuthHelperModal: React.FC<OAuthHelperModalProps> = ({ isOpen, onClose, onProceed, clientId, origin }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="oauth-helper-title"
      onClick={onClose}
    >
      <div
        className="bg-bg-secondary w-full max-w-3xl p-6 rounded-2xl shadow-lg border border-border-primary flex flex-col max-h-[95vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 id="oauth-helper-title" className="text-xl font-bold text-accent flex items-center gap-3">
            <WarningIcon className="w-6 h-6" />
            Final Google Cloud Setup Guide
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
            <div className="bg-danger-bg/50 border-l-4 border-danger p-4 rounded-md">
                <h3 className="font-bold text-danger text-lg">Troubleshooting: "The API developer key is invalid."</h3>
                <p className="text-sm text-text-primary mt-2">
                    This specific error is almost always caused by a misconfiguration of your <strong className="text-highlight-yellow">API Key</strong> in the Google Cloud Console, not an issue with the application code. It means Google is rejecting requests from this website's URL.
                </p>
                <p className="text-sm text-text-primary mt-2">
                    The solution is to add a correct <strong className="text-highlight-yellow">"HTTP referrers (web sites)"</strong> restriction to your API Key. Please follow Step 4 very carefully.
                </p>
                 <p className="text-sm text-text-primary mt-3 font-semibold">
                    Important: The API Key is loaded from the <code className="bg-bg-primary p-1 rounded-md text-xs">process.env.API_KEY</code> environment variable where the app is hosted. You do <strong className="text-highlight-yellow">NOT</strong> enter the API Key anywhere in this application's user interface.
                </p>
            </div>

            <WizardStep step={1} title="Enable Required APIs">
                <p>
                    Ensure both the <strong className="text-highlight-yellow">Google Drive API</strong> and the <strong className="text-highlight-yellow">Google Picker API</strong> are enabled for your project.
                </p>
                <div className="mt-2 p-3 bg-bg-primary/50 rounded-lg border border-border-primary grid grid-cols-1 md:grid-cols-2 gap-4">
                    <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener noreferrer" className="inline-block w-full text-center bg-accent text-accent-text font-bold py-2 px-4 rounded-lg hover:bg-accent-hover transition-colors">
                        Enable Drive API
                    </a>
                    <a href="https://console.cloud.google.com/apis/library/picker.googleapis.com" target="_blank" rel="noopener noreferrer" className="inline-block w-full text-center bg-accent text-accent-text font-bold py-2 px-4 rounded-lg hover:bg-accent-hover transition-colors">
                        Enable Picker API
                    </a>
                </div>
                <div className="mt-4 p-3 bg-bg-tertiary rounded-md text-xs">
                    <p className="font-bold text-text-secondary">Permissions Note:</p>
                    <p>
                        To function correctly, this app will request the <code className="text-text-primary">drive</code> scope, which grants broad access to your files. This is required by Google for two reasons: 1) To allow the folder picker to display your existing folders, and 2) To allow the app to create files and subfolders in the directory you select. The app will <strong className="text-highlight-yellow">only</strong> interact with the library folder you choose.
                    </p>
                </div>
            </WizardStep>
            
            <WizardStep step={2} title="Create the Correct OAuth Client ID">
                <p>
                   You need an OAuth 2.0 Client ID for a <strong className="text-highlight-yellow">"Web application"</strong>.
                </p>
                <div className="mt-2 p-3 bg-bg-primary/50 rounded-lg border border-border-primary text-sm">
                    Go to your <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-accent-light underline hover:text-accent">Credentials page</a>. Click <b className="text-text-primary">"+ CREATE CREDENTIALS"</b> &rarr; <b className="text-text-primary">"OAuth client ID"</b> &rarr; select <b className="text-highlight-green">"Web application"</b>.
                </div>
            </WizardStep>

            <WizardStep step={3} title="Configure OAuth Client ID URIs">
                 <p>
                    Tell Google which web addresses can use this Client ID. The URL must match <strong className="text-highlight-yellow">exactly</strong>, including http/https.
                </p>
                 <div className="space-y-4 p-4 mt-2 bg-bg-primary/50 rounded-lg border border-border-primary">
                    <CopyableField label="Your Current App URL (Origin):" value={origin} />
                    <ol className="list-decimal list-inside space-y-2 text-sm">
                        <li>Under <b className="text-highlight-green">"Authorized JavaScript origins"</b>, click <b className="text-text-primary">"+ ADD URI"</b> and paste the URL from above.</li>
                        <li>Under <b className="text-highlight-green">"Authorized redirect URIs"</b>, click <b className="text-text-primary">"+ ADD URI"</b> and paste the exact same URL again.</li>
                        <li>Click <b className="text-text-primary">"Save"</b>.</li>
                    </ol>
                </div>
            </WizardStep>

            <WizardStep step={4} title="Crucial Step: Restrict Your API Key">
                <p>
                    This is the most common point of failure for the "invalid key" error. Your API Key must be restricted to allow requests from your production domain.
                </p>
                <div className="mt-2 p-3 bg-bg-primary/50 rounded-lg border border-border-primary text-sm space-y-3">
                    <p>
                        On the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-accent-light underline hover:text-accent">Credentials page</a>, find and edit the API Key used in your `process.env.API_KEY`.
                    </p>
                    <ol className="list-decimal list-inside space-y-3">
                        <li>
                            Under <b className="text-highlight-green">"Application restrictions"</b>, select the <b className="text-text-primary">"HTTP referrers (web sites)"</b> option.
                        </li>
                        <li>
                            Under <b className="text-highlight-green">"Website restrictions"</b>, click <b className="text-text-primary">"+ ADD"</b>. Enter your app's domain.
                            <div className="bg-bg-secondary p-2 rounded-md mt-2 text-xs space-y-1">
                                <p className="font-bold">Examples:</p>
                                <p>If your app is at <code className="text-text-primary">https://my-app.vercel.app</code>, add <code className="text-text-primary">my-app.vercel.app</code></p>
                                <p>To allow all subdomains, add <code className="text-text-primary">*.my-domain.com/*</code></p>
                                <p>For local development on port 5173, add <code className="text-text-primary">localhost:5173</code></p>
                                <p className="text-text-muted">Use the "Your Current App URL" from Step 3 as a guide.</p>
                            </div>
                        </li>
                        <li>
                            Under <b className="text-highlight-green">"API restrictions"</b>, ensure that both <b className="text-text-primary">"Google Drive API"</b> and <b className="text-text-primary">"Google Picker API"</b> are in the list of allowed APIs.
                        </li>
                        <li className="font-bold text-highlight-yellow">
                            Click <b className="text-text-primary">"Save"</b>. IMPORTANT: It may take up to <b className="text-text-primary">5 minutes</b> for these changes to take effect on Google's servers.
                        </li>
                    </ol>
                </div>
            </WizardStep>

            <WizardStep step={5} title="Set Credentials in App">
                <p>
                   Ensure the correct credentials are used by the application.
                </p>
                 <div className="mt-2 p-3 bg-bg-primary/50 rounded-lg border border-border-primary text-sm space-y-2">
                     <p>
                        1. <b className="text-text-primary">Client ID:</b> Copy your OAuth Client ID from the Google Console. Close this guide, click the <b className="text-text-primary">gear icon</b> (Settings) in the header, paste it into the "Google Client ID" field, and click "Save".
                     </p>
                      <p>
                        2. <b className="text-text-primary">API Key:</b> The API Key you configured in Step 4 must be set as the `API_KEY` environment variable on the server or platform where you deployed this app.
                     </p>
                </div>
            </WizardStep>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-6 mt-4 border-t border-border-primary flex-shrink-0">
            <button
                onClick={onClose}
                className="w-full sm:w-auto bg-bg-tertiary text-text-secondary font-semibold py-2 px-6 rounded-lg hover:bg-bg-tertiary-hover transition-colors"
            >
                Cancel
            </button>
            <button
                onClick={onProceed}
                className="w-full sm:flex-1 bg-accent text-accent-text font-bold py-2 px-6 rounded-lg hover:bg-accent-hover transition-colors"
            >
                I have re-checked all steps, Connect Now!
            </button>
        </div>
      </div>
    </div>
  );
};