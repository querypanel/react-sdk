"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    swan?: Array<unknown> & { isLoaded?: boolean; pk?: string };
  }
}

const GETSWAN_PK = "cmmxfajo000050jjliblxevmd";
const GETSWAN_SRC = `https://script.getswan.com?pk=${GETSWAN_PK}`;

export default function GetswanTracker() {
  useEffect(() => {
    const w = window;
    if (!w.swan) {
      w.swan = [];
    }
    const swan = w.swan;

    if (swan.isLoaded) {
      return;
    }

    swan.isLoaded = true;
    swan.pk = GETSWAN_PK;

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = GETSWAN_SRC;
    document.head.appendChild(script);
  }, []);

  return null;
}
