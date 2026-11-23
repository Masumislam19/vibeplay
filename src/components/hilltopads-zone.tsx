"use client";

import { useEffect } from "react";

const ZONE_ID = "7522161";

const SCRIPT_URL =
  "https://quarrelsomebitter.com/bZX.VIsXdvGglH0uYIWHcx/YeVm/9ouNZuUDlTkkPNT/c/1xMsj_I/xhN-jtEzt/N/zvUtycMGjMEL2AN/Qj";

export default function HilltopAdsZone() {
  useEffect(() => {
    // Prevent duplicate loading
    if (
      document.querySelector(
        `script[data-hilltopads-zone="${ZONE_ID}"]`
      )
    ) {
      return;
    }

    const script = document.createElement("script") as
      HTMLScriptElement & { settings?: Record<string, never> };

    script.settings = {};
    script.src = SCRIPT_URL;
    script.async = true;
    script.referrerPolicy = "no-referrer-when-downgrade";
    script.dataset.hilltopadsZone = ZONE_ID;

    document.body.appendChild(script);
  }, []);

  return null;
}
