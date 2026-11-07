"use client";

import { useState } from "react";

/** Demo console: a "Run now" button for the escrow automation. */
export default function AutomationPage() {
  const [secret, setSecret] = useState("");
  const [dryRun, setDryRun] = useState(false);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState("");

  async function run() {
    setBusy(true);
    setOutput("");
    try {
      const res = await fetch(`/api/automation/run${dryRun ? "?dryRun=1" : ""}`, {
        method: "POST",
        headers: { "x-automation-secret": secret },
      });
      setOutput(JSON.stringify(await res.json(), null, 2));
    } catch (e) {
      setOutput(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 640 }}>
      <h1>Escrow automation</h1>
      <p>Runs the timeout rules now: expire, cancel unpaid, auto-refund, auto-release.</p>
      <input
        type="password"
        placeholder="Automation secret"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        style={{ padding: 8, width: "100%", marginBottom: 12 }}
      />
      <label style={{ display: "block", marginBottom: 12 }}>
        <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />{" "}
        Dry run (show what would happen, change nothing)
      </label>
      <button onClick={run} disabled={busy || !secret} style={{ padding: "10px 20px" }}>
        {busy ? "Running…" : "Run now"}
      </button>
      {output && (
        <pre style={{ background: "#111", color: "#0f0", padding: 12, marginTop: 16, overflow: "auto" }}>
          {output}
        </pre>
      )}
    </div>
  );
}
