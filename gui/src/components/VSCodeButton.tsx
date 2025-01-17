import React, { ButtonHTMLAttributes } from 'react';
import './VSCodeButton.css';

interface VSCodeButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
}

export const VSCodeButton: React.FC<VSCodeButtonProps> = ({ 
  variant = 'primary',
  className = '', 
  style,
  disabled,
  ...props 
}) => {
  const baseClassName = 'px-4 text-sm focus:outline focus:outline-1 focus:outline-[var(--vscode-focusBorder)] vscode-button';
  const mergedClassName = `${baseClassName} ${className}`.trim();

  const baseStyle = {
    backgroundColor: variant === 'primary' 
      ? 'var(--vscode-button-background)'
      : 'var(--vscode-button-secondaryBackground)',
    color: variant === 'primary'
      ? 'var(--vscode-button-foreground)'
      : 'var(--vscode-button-secondaryForeground)',
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    ...style
  };

  return (
    <button
      className={mergedClassName}
      style={baseStyle}
      disabled={disabled}
      {...props}
    />
  );
};
