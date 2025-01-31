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
  const baseClassName = `px-2 py-1 text-sm focus:outline focus:outline-1 focus:outline-[var(--vscode-focusBorder)] vscode-button rounded-sm ${
    variant === 'primary'
      ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
      : 'bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)]'
  } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`;
  const mergedClassName = `${baseClassName} ${className} ${className.includes('border ')?'':'border-none'}`.trim();

  const baseStyle = {
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
