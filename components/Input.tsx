import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input: React.FC<InputProps> = ({ label, className = "", ...props }) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-zinc-400 mb-1.5">
          {label}
        </label>
      )}
      <input 
        className={`w-full p-3 bg-zinc-950 border border-zinc-700 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none text-white placeholder-zinc-500 transition-all ${className}`}
        {...props}
      />
    </div>
  );
};