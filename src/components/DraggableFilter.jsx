import React, { useState, useRef, useEffect } from 'react';
import { GripVertical, X } from 'lucide-react';

const DraggableFilter = ({ 
  label, 
  value, 
  onChange, 
  min = 0, 
  max = 1000000000, 
  step = 1000000,
  formatValue = (val) => val,
  unit = '',
  onRemove,
  removable = false
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, value: 0 });
  const sliderRef = useRef(null);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      value: localValue
    });
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStart.x;
    const sensitivity = (max - min) / 200; // Adjust sensitivity
    const newValue = Math.max(min, Math.min(max, dragStart.value + deltaX * sensitivity));
    
    setLocalValue(newValue);
    onChange(Math.round(newValue / step) * step);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  const handleInputChange = (e) => {
    const newValue = parseFloat(e.target.value) || 0;
    setLocalValue(newValue);
    onChange(newValue);
  };

  const percentage = ((localValue - min) / (max - min)) * 100;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <GripVertical className="h-4 w-4 text-gray-400" />
          <label className="text-sm font-medium text-gray-700">{label}</label>
        </div>
        {removable && onRemove && (
          <button
            onClick={onRemove}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title="Remove filter"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="space-y-3">
        {/* Slider Track */}
        <div className="relative">
          <div className="h-2 bg-gray-200 rounded-full">
            <div 
              className="h-2 bg-green-600 rounded-full transition-all duration-150"
              style={{ width: `${percentage}%` }}
            />
          </div>
          
          {/* Draggable Handle */}
          <div
            ref={sliderRef}
            className={`absolute top-1/2 transform -translate-y-1/2 w-4 h-4 bg-green-600 rounded-full cursor-grab border-2 border-white shadow-md transition-all duration-150 ${
              isDragging ? 'cursor-grabbing scale-110' : 'hover:scale-105'
            }`}
            style={{ left: `calc(${percentage}% - 8px)` }}
            onMouseDown={handleMouseDown}
          />
        </div>

        {/* Value Display and Input */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Current: <span className="font-semibold text-gray-900">{formatValue(localValue)}{unit}</span>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="number"
              value={localValue}
              onChange={handleInputChange}
              min={min}
              max={max}
              step={step}
              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
            <span className="text-xs text-gray-500">{unit}</span>
          </div>
        </div>

        {/* Range Labels */}
        <div className="flex justify-between text-xs text-gray-500">
          <span>{formatValue(min)}{unit}</span>
          <span>{formatValue(max)}{unit}</span>
        </div>
      </div>
    </div>
  );
};

export default DraggableFilter;

