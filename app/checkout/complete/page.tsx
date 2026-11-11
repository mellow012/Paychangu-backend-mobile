import { verifyTransaction, tradeIdFromTxRef } from "@/lib/paychangu";
import { markFundsLocked } from "@/lib/tradeSync";

// Always run on the server per request (never cache a payment check)
export const dynamic = "force-dynamic";

/**
 * PayChangu redirects the buyer here after checkout (?tx_ref=...&status=...).
 * Instead of relying only on the webhook, we verify the payment with PayChangu
 * right here and lock the funds. markFundsLocked is idempotent, so it is safe
 * if the webhook also lands.
 */
export default async function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: { tx_ref?: string; status?: string };
}) {
  let state: "success" | "pending" | "failed" = "pending";
  let note = "";
  let tradeId: string | null = null;

  const txRef = searchParams.tx_ref;

  if (!txRef) {
    note = "No payment reference was returned.";
  } else {
    try {
      const verified = await verifyTransaction(txRef);
      if (verified.status === "success") {
        tradeId = tradeIdFromTxRef(verified.txRef);
        if (tradeId) {
          const r = await markFundsLocked(tradeId, verified.reference);
          console.log(`return-page markFundsLocked(${tradeId}):`, r);
        }
        state = "success";
      } else if (verified.status === "failed") {
        state = "failed";
      }
    } catch (err) {
      console.error("return-page verify error:", err);
      note = "We could not confirm the payment yet.";
    }
  }

  const title =
    state === "success"
      ? "Payment received"
      : state === "failed"
      ? "Payment not completed"
      : "Confirming payment…";

  const body =
    state === "success"
      ? "Your funds are locked in escrow. Return to the Escrow app — the trade is updated."
      : state === "failed"
      ? "The payment was cancelled or failed. Close this and try again from the app."
      : `${note} Return to the app; it will update once the payment is confirmed.`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
        padding: 24,
      }}
    >
      <h1>{title}</h1>
      <p style={{ color: "#666", maxWidth: 360 }}>{body}</p>
      {tradeId && (
      <a
        href={`escrowmalawi://payment?tradeId=${tradeId}&status=${state === "success" ? "success" : "cancelled"}`}
        style={{
          marginTop: 16,
          padding: "12px 24px",
          background: "#00897B",
          color: "#fff",
          borderRadius: 8,
          textDecoration: "none",
        }}
      >
        Return to app
      </a>
      )}
    </div>
  );
}