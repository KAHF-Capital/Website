import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

const Select = ({ value, onValueChange, children, ...props }) => {
  return React.cloneElement(children, { value, onValueChange, ...props });
};

const SelectTrigger = React.forwardRef(({ className = '', children, onValueChange, ...props }, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const triggerRef = useRef(null);

  const handleClick = () => {
    setIsOpen(!isOpen);
  };

  const handleSelect = (value, label) => {
    setSelectedValue(value);
    setSelectedLabel(label);
    setIsOpen(false);
    if (onValueChange) {
      onValueChange(value);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (triggerRef.current && !triggerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative" ref={triggerRef}>
      <button
        ref={ref}
        type="button"
        onClick={handleClick}
        className={`flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        {...props}
      >
        <span className={selectedLabel ? 'text-gray-900' : 'text-gray-500'}>
          {selectedLabel || 'Select option...'}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
          {React.Children.map(children, (child) => {
            if (React.isValidElement(child) && child.type === SelectContent) {
              return React.cloneElement(child, { onSelect: handleSelect });
            }
            return child;
          })}
        </div>
      )}
    </div>
  );
});

SelectTrigger.displayName = 'SelectTrigger';

const SelectContent = React.forwardRef(({ className = '', children, onSelect, ...props }, ref) => {
  return (
    <div ref={ref} className={`py-1 ${className}`} {...props}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child) && child.type === SelectItem) {
          return React.cloneElement(child, { onSelect });
        }
        return child;
      })}
    </div>
  );
});

SelectContent.displayName = 'SelectContent';

const SelectItem = React.forwardRef(({ className = '', value, children, onSelect, ...props }, ref) => {
  const handleClick = () => {
    if (onSelect) {
      onSelect(value, children);
    }
  };

  return (
    <div
      ref={ref}
      onClick={handleClick}
      className={`relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-gray-100 focus:bg-gray-100 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

SelectItem.displayName = 'SelectItem';

const SelectValue = ({ placeholder, children }) => {
  return children || placeholder;
};

SelectValue.displayName = 'SelectValue';

export { Select, SelectTrigger, SelectContent, SelectItem, SelectValue };
