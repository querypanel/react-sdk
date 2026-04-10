"use client"

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { cn } from '@/lib/utils';

interface AIAnalysisRendererProps {
  content: string;
  className?: string;
}

export default function AIAnalysisRenderer({ content, className }: AIAnalysisRendererProps) {
  return (
    <div className={cn("ai-analysis-content", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Headers
          h1: ({ children, ...props }) => (
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 mt-6 first:mt-0 border-b border-gray-200 dark:border-gray-700 pb-2" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3 mt-5 first:mt-0" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2 mt-4 first:mt-0" {...props}>
              {children}
            </h3>
          ),
          h4: ({ children, ...props }) => (
            <h4 className="text-base font-medium text-gray-600 dark:text-gray-400 mb-2 mt-3 first:mt-0" {...props}>
              {children}
            </h4>
          ),

          // Paragraphs
          p: ({ children, ...props }) => (
            <p className="text-gray-700 dark:text-gray-300 mb-3 leading-relaxed" {...props}>
              {children}
            </p>
          ),

          // Lists
          ul: ({ children, ...props }) => (
            <ul className="list-disc list-inside mb-4 space-y-1 text-gray-700 dark:text-gray-300" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="list-decimal list-inside mb-4 space-y-1 text-gray-700 dark:text-gray-300" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="ml-4" {...props}>
              {children}
            </li>
          ),

          // Code blocks
          code: ({ children, className, ...props }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={cn("block bg-gray-900 dark:bg-gray-800 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono", className)} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children, ...props }) => (
            <pre className="bg-gray-900 dark:bg-gray-800 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm font-mono mb-4" {...props}>
              {children}
            </pre>
          ),

          // Blockquotes
          blockquote: ({ children, ...props }) => (
            <blockquote className="border-l-4 border-purple-500 pl-4 py-2 mb-4 bg-purple-50 dark:bg-purple-950/20 text-gray-700 dark:text-gray-300 italic" {...props}>
              {children}
            </blockquote>
          ),

          // Tables
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full border border-gray-200 dark:border-gray-700 rounded-lg" {...props}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="bg-gray-50 dark:bg-gray-800" {...props}>
              {children}
            </thead>
          ),
          tbody: ({ children, ...props }) => (
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700" {...props}>
              {children}
            </tbody>
          ),
          tr: ({ children, ...props }) => (
            <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50" {...props}>
              {children}
            </tr>
          ),
          th: ({ children, ...props }) => (
            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider" {...props}>
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100" {...props}>
              {children}
            </td>
          ),

          // Links
          a: ({ children, href, ...props }) => (
            <a 
              href={href} 
              className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 underline decoration-purple-300 dark:decoration-purple-600 hover:decoration-purple-500 dark:hover:decoration-purple-400 transition-colors" 
              target="_blank" 
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),

          // Horizontal rules
          hr: ({ ...props }) => (
            <hr className="my-6 border-gray-200 dark:border-gray-700" {...props} />
          ),

          // Strong/Bold
          strong: ({ children, ...props }) => (
            <strong className="font-semibold text-gray-900 dark:text-gray-100" {...props}>
              {children}
            </strong>
          ),

          // Emphasis/Italic
          em: ({ children, ...props }) => (
            <em className="italic text-gray-600 dark:text-gray-400" {...props}>
              {children}
            </em>
          ),

          // Strikethrough
          del: ({ children, ...props }) => (
            <del className="line-through text-gray-500 dark:text-gray-500" {...props}>
              {children}
            </del>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
