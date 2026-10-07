export default function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: { tx_ref?: string; status?: string };
}) {
  const failed = searchParams.status === "failed";

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
        padding: "24px",
      }}
    >
      <h1>{failed ? "Payment not completed" : "Payment received"}</h1>
      <p style={{ color: "#666", maxWidth: 360 }}>
        {failed
          ? "The payment was cancelled or failed. You can close this and try again from the app."
          : "You can close this window and return to the Escrow app — the trade will update automatically once we confirm the payment."}
      </p>
    </div>
  );
}
