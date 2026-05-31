import React from 'react';
import { useRouter } from 'next/router';
import { Bot } from 'lucide-react';
import { track } from '../../lib/analytics';

// Routes the user to /kahf-ai with a pre-loaded prompt.
export default function AskAIButton({
  prompt,
  ticker,
  source = 'unknown',
  variant = 'subtle',
  size = 'sm',
  className = '',
  children
}) {
  const router = useRouter();

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    track('ask_ai_clicked', { source, ticker: ticker || undefined, prompt: prompt?.slice(0, 80) });
    const query = { q: prompt || '' };
    if (ticker) query.t = ticker;
    router.push({ pathname: '/kahf-ai', query });
  };

  const base = 'inline-flex items-center gap-1.5 font-medium transition-colors rounded-md';
  const sizes = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
    lg: 'text-base px-4 py-2'
  };
  const variants = {
    primary: 'bg-green-600 hover:bg-green-700 text-white',
    subtle: 'bg-green-50 hover:bg-green-100 text-green-700 border border-green-200',
    ghost: 'text-green-700 hover:bg-green-50'
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${base} ${sizes[size] || sizes.sm} ${variants[variant] || variants.subtle} ${className}`}
    >
      <Bot className={size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      {children || (ticker ? `Ask AI about ${ticker}` : 'Ask KAHF AI')}
    </button>
  );
}
