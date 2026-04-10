"use client"

import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";

// Simple test block to verify slash menu integration
export const TestBlock = createReactBlockSpec(
  {
    type: "testblock",
    propSchema: {
      textAlignment: defaultProps.textAlignment,
      textColor: defaultProps.textColor,
    },
    content: "none",
  },
  {
    render: () => {
      return (
        <div className="test-block bg-yellow-100 dark:bg-yellow-900 border-2 border-yellow-300 dark:border-yellow-600 rounded-lg p-4 text-center">
          <div className="text-2xl mb-2">🧪</div>
          <div className="font-medium text-gray-900 dark:text-gray-100">
            Test Block
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            This is a simple test block to verify custom blocks work!
          </div>
        </div>
      );
    },
  }
);
