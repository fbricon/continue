import React from 'react';

export const ProgressBlock: React.FC<{ progress: number; }> = ({ progress }) => {
  return (
    <div className="flex justify-end items-center opacity-80">
      <span className="inline-block text-right w-[55px] tabular-nums">
        {progress.toFixed(2)}%
      </span>
      <span className="ml-1">complete</span>
    </div>
  );
};
