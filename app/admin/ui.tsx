/** Small shared UI bits for the moderator console. */

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spin" style={{ width: size, height: size }} role="status" aria-label="Loading" />;
}

export function Skeleton({ h = 16, w = "100%", r = 8 }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r }} />;
}

/** Full-page loading placeholder: a few stat blocks and cards. */
export function PageSkeleton() {
  return (
    <div aria-busy="true">
      <div style={{ margin: "4px 0 20px" }}><Skeleton h={28} w={180} /></div>
      <div className="grid">
        {[0, 1, 2, 3].map((i) => (
          <div className="stat" key={i}><Skeleton h={12} w="60%" /><div style={{ height: 10 }} /><Skeleton h={24} w="40%" /></div>
        ))}
      </div>
      {[0, 1].map((i) => (
        <div className="card" key={i}>
          <Skeleton h={16} w="45%" /><div style={{ height: 12 }} /><Skeleton h={12} /><div style={{ height: 8 }} /><Skeleton h={12} w="80%" />
        </div>
      ))}
    </div>
  );
}

/** Centered spinner with a label, for actions that take a few seconds. */
export function Loader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loader"><Spinner size={22} /><span>{label}</span></div>
  );
}
