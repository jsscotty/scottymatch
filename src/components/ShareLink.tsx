import React from 'react';
import { Link, Copy, Check } from 'lucide-react';

interface ShareLinkProps {
  link: string;
}

function ShareLink({ link }: ShareLinkProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-purple-500/20 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Link className="w-4 h-4 text-purple-300" />
        <span className="text-sm text-purple-300">Share with your friend</span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={link}
          readOnly
          className="flex-1 bg-gray-700/50 border border-gray-600 rounded-lg py-2 px-3
                     text-white text-sm focus:outline-none focus:ring-2 
                     focus:ring-purple-500 focus:border-transparent"
        />
        <button
          onClick={handleCopy}
          className="p-2 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg
                   transition-colors duration-200"
          title={copied ? 'Copied!' : 'Copy to clipboard'}
        >
          {copied ? (
            <Check className="w-5 h-5 text-green-400" />
          ) : (
            <Copy className="w-5 h-5 text-purple-300" />
          )}
        </button>
      </div>
    </div>
  );
}

export default ShareLink;