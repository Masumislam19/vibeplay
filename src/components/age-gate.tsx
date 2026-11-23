"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "vibeplay_age_verified_v1";

export default function AgeGate() {
  const [status, setStatus] = useState<"checking" | "blocked" | "allowed">(
    "checking"
  );
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    try {
      const verified = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus(verified === "yes" ? "allowed" : "blocked");
    } catch {
      setStatus("blocked");
    }
  }, []);

  function acceptAge() {
    try {
      localStorage.setItem(STORAGE_KEY, "yes");
    } catch {
      // Continue for this session if storage is unavailable.
    }

    setStatus("allowed");
  }

  if (status === "allowed") return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#080808",
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          padding: "35px 25px",
          borderRadius: "18px",
          background: "#181818",
          color: "#ffffff",
          textAlign: "center",
          border: "1px solid #333",
        }}
      >
        <div style={{ fontSize: "48px", marginBottom: "15px" }}>🔞</div>

        <h1
          id="age-gate-title"
          style={{ fontSize: "27px", fontWeight: 800, marginBottom: "15px" }}
        >
          Age Restricted Content
        </h1>

        <h2 style={{ color: "#ff4545", fontSize: "20px" }}>
          18+ Only
        </h2>

        <p
          style={{
            color: "#cccccc",
            fontSize: "15px",
            lineHeight: 1.7,
            margin: "18px 0 25px",
          }}
        >
          This website is intended for adults aged 18 and older.
          Please confirm your age before entering <span style={{ color: "#ff4545" }}>Tiktoker viral video🥵 </span>.
        </p>

        {status === "checking" ? (
          <p>Checking age confirmation...</p>
        ) : denied ? (
          <p style={{ color: "#ff5555", fontWeight: 600 }}>
            Access denied. You must be 18 or older to enter.
          </p>
        ) : (
          <>
            <button
              onClick={acceptAge}
              style={{
                width: "100%",
                padding: "15px",
                border: "none",
                borderRadius: "9px",
                background: "#e11d48",
                color: "#ffffff",
                fontSize: "16px",
                fontWeight: 700,
                cursor: "pointer",
                marginBottom: "12px",
              }}
            >
              I am 18 or Older — Enter
            </button>

            <button
              onClick={() => setDenied(true)}
              style={{
                width: "100%",
                padding: "13px",
                border: "1px solid #555",
                borderRadius: "9px",
                background: "transparent",
                color: "#ffffff",
                fontSize: "15px",
                cursor: "pointer",
              }}
            >
              I am Under 18 — Exit
            </button>
          </>
        )}

        <p style={{ color: "#777", fontSize: "11px", marginTop: "22px" }}>
          By continuing, you confirm that you are at least 18 years old.
        </p>
      </div>
    </div>
  );
}