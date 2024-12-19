import React from 'react';

interface ProgressBarProps {
  progress: number;
}

function ProgressBar({ progress }: ProgressBarProps) {
  return (
    <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
      <div
        className="bg-green-500 h-full transition-all duration-300 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

export default ProgressBar;