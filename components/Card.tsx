import React from 'react';

interface CardProps {
  children?: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = "" }) => (
  <div className={`bg-zinc-800 rounded-xl shadow-lg border border-zinc-700 p-6 ${className}`}>
    {children}
  </div>
);