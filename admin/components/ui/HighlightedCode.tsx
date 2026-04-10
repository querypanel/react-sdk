"use client";

import { useEffect, useRef } from 'react';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';

hljs.registerLanguage('typescript', typescript);

interface HighlightedCodeProps {
  code: string;
  language?: 'typescript';
}

export default function HighlightedCode({ code, language = 'typescript' }: HighlightedCodeProps) {
  const codeRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (codeRef.current) {
      hljs.highlightElement(codeRef.current);
    }
  }, []);

  return (
    <pre className={"min-w-0 max-w-full rounded-lg p-3 text-left overflow-x-auto border bg-gray-100 dark:bg-gray-950 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100"}>
      <code ref={codeRef} className={`language-${language} hljs text-sm`}>{code}</code>
    </pre>
  );
}



