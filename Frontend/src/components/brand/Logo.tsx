import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'auth';
}

const logoWidths = {
  sm: { width: 32, height: 32, mark: true },
  md: { width: 190, height: 52, mark: false },
  lg: { width: 150, height: 44, mark: false },
  xl: { width: 190, height: 54, mark: false },
  auth: { width: 250, height: 68, mark: false },
};

export const Logo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const { width, height, mark } = logoWidths[size];

  return (
    <img
      src={mark ? '/assets/safisali-companies-mark.png' : '/assets/safisali-companies-wordmark.png'}
      alt="Safi Sali Companies"
      className={`block shrink-0 object-contain ${className}`}
      style={{ width, height }}
    />
  );
};
