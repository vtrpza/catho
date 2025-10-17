import React, { useEffect, useRef, useState } from 'react';

export default function ExpandableText({ text = '', maxLines = 4, className = '' }) {
  const contentRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const checkClamp = () => {
      if (!element) return;
      const { scrollHeight, clientHeight } = element;
      setIsClamped(scrollHeight - clientHeight > 1);
    };

    checkClamp();
  }, [text, maxLines]);

  if (!text) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      <div
        ref={contentRef}
        className={`text-sm leading-6 text-slate-700 transition-all line-clamp ${expanded ? 'line-clamp-none' : ''}`}
        style={
          expanded
            ? {}
            : {
                WebkitLineClamp: maxLines
              }
        }
      >
        {text}
      </div>
      {isClamped && (
        <button
          type="button"
          onClick={() => setExpanded((state) => !state)}
          className="text-sm font-medium text-primary-600 hover:text-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded transition-colors"
        >
          {expanded ? 'Ver menos' : 'Ver mais'}
        </button>
      )}
    </div>
  );
}
