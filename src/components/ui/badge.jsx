import React from 'react';

const Badge = React.forwardRef(({ className = '', variant = 'default', children, ...props }, ref) => {
  const baseClasses = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium';
  
  const variantClasses = {
    default: 'bg-gray-100 text-gray-800',
    secondary: 'bg-gray-100 text-gray-900',
    destructive: 'bg-red-100 text-red-800',
    outline: 'border border-gray-200 bg-white text-gray-700',
  };

  const classes = `${baseClasses} ${variantClasses[variant]} ${className}`;

  return (
    <span ref={ref} className={classes} {...props}>
      {children}
    </span>
  );
});

Badge.displayName = 'Badge';

export { Badge };
