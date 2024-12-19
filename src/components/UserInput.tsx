import React from 'react';
import { User } from 'lucide-react';

interface UserInputProps {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function UserInput({ label, value, onChange }: UserInputProps) {
  return (
    <div className="relative">
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={onChange}
          className="w-full bg-gray-700/50 border border-gray-600 rounded-lg py-2 px-4 pl-10
                   text-white placeholder-gray-400 focus:outline-none focus:ring-2 
                   focus:ring-purple-500 focus:border-transparent"
          placeholder="Enter username"
        />
        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      </div>
    </div>
  );
}

export default UserInput;