import { useState, useCallback } from 'react';

interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

interface Layouts {
  [key: string]: LayoutItem[];
}

function loadLayouts(userId: string) {
  const storageKey = `widget-layouts-${userId}`;

  let layouts: Layouts = {
    lg: [],
    md: [],
    sm: [],
    xs: [],
    xxs: [],
  }

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      layouts = parsed;
    }
  } catch (error) {
    console.error('Failed to load layouts from localStorage:', error);
  } finally {
    return layouts;
  }
}

export function useLayoutPersistence(userId: string) {
  const [layouts, setLayouts] = useState<Layouts>(loadLayouts(userId));
  const storageKey = `widget-layouts-${userId}`;

  // Save layouts to localStorage
  const saveLayouts = useCallback((newLayouts: Layouts) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(newLayouts));
      setLayouts(newLayouts);
    } catch (error) {
      console.error('Failed to save layouts to localStorage:', error);
    }
  }, [storageKey]);

  // Update layouts without saving (for initialization)
  const updateLayouts = useCallback((newLayouts: Layouts) => {
    setLayouts(newLayouts);
  }, []);

  // Reset layouts
  const resetLayouts = useCallback(() => {
    localStorage.removeItem(storageKey);
    setLayouts({
      lg: [],
      md: [],
      sm: [],
      xs: [],
      xxs: [],
    });
  }, [storageKey]);

  return {
    layouts,
    saveLayouts,
    updateLayouts,
    resetLayouts,
  };
} 