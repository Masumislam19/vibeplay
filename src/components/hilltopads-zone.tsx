"use client";

import { useEffect } from "react";

const ZONE_ID = "7522161";

const SCRIPT_URL =
  "https://quarrelsomebitter.com/bZX.VIsXdvGglH0uYIWHcx/YeVm/9ouNZuUDlTkkPNT/c/1xMsj_I/xhN-jtEzt/N/zvUtycMGjMEL2AN/Qj";

const IN_PAGE_PUSH_URL =
  "https://simplistic-walk.com/bmX.V/stdVGsln0DYJW/cq/WexmP9GuCZGU/lUkkPgTZcr2gNsTAgzxXMYTVMJtQNqz-Yq1BOSDUEPx/Nnw_";

export default function HilltopAdsZone() {
  useEffect(() => {
    // Existing HilltopAds zone
    if (
      !document.querySelector(
        `script[data-hilltopads-zone="${ZONE_ID}"]`
      )
    ) {
      const script = document.createElement("script") as
        HTMLScriptElement & { settings?: Record<string, unknown> };

      script.settings = {};
      script.src = SCRIPT_URL;
      script.async = true;
      script.referrerPolicy = "no-referrer-when-downgrade";
      script.dataset.hilltopadsZone = ZONE_ID;

      document.body.appendChild(script);
    }

    // In-Page Push — load once across the website
    if (
      !document.querySelector(
        'script[data-hilltopads-inpage="true"]'
      )
    ) {
      const script = document.createElement("script") as
        HTMLScriptElement & { settings?: Record<string, unknown> };

      script.settings = {};
      script.src = IN_PAGE_PUSH_URL;
      script.async = true;
      script.referrerPolicy = "no-referrer-when-downgrade";
      script.dataset.hilltopadsInpage = "true";

      document.body.appendChild(script);
    }
  }, []);

  return null;
}