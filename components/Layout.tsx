import React from 'react';

interface LayoutProps {
  children?: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 font-sans selection:bg-blue-500 selection:text-white">
      <div className="max-w-4xl mx-auto p-4 md:p-6">
        {children}
      </div>
    </div>
  );
};