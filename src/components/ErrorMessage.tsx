import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
}

function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center gap-3 text-red-300">
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      <p>{message}</p>
    </div>
  );
}

export default ErrorMessage;