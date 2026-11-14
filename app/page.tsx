import "./home.css";

export const metadata = {
  title: "Escrow P2P: buy and sell safely",
  description:
    "Peer-to-peer marketplace where your money is held in escrow until you confirm delivery. Every step is recorded on-chain and disputes are resolved fairly.",
};

// Set this once the Android app has a public download link; the button stays hidden until then.
const APP_DOWNLOAD_URL = "";

const STEPS = [
  { t: "Agree", d: "Find an item and send a trade request. The seller accepts it." },
  { t: "Pay into escrow", d: "You pay with mobile money or card. The seller can't touch the money yet." },
  { t: "Receive the item", d: "The seller delivers and marks it as sent." },
  { t: "Confirm and release", d: "You confirm you got it, and only then is the seller paid." },
];

const FEATURES = [
  {
    ico: "🛡️",
    t: "Escrow protection",
    d: "Your money is held safely until you confirm delivery. No more paying and hoping.",
  },
  {
    ico: "⛓️",
    t: "Proof on the blockchain",
    d: "Each step of a trade is recorded on Ethereum, so nobody can quietly change the history. Anyone can verify it on Etherscan.",
  },
  {
    ico: "⚖️",
    t: "Fair disputes",
    d: "If something goes wrong, both sides tell their story with photos. An AI summarises it and a human moderator makes the final call.",
  },
];

export default function HomePage() {
  return (
    <div className="home">
      <div className="wrap">
        <div className="top">
          <div className="logo"><span>🛡️</span> Escrow P2P</div>
          <nav className="top-nav" aria-label="Main navigation">
            <a href="/admin/login" className="nav-link">Moderator Login</a>
          </nav>
        </div>

        <section className="hero">
          <span className="pill">Safer trading in Malawi</span>
          <h1>Buy and sell online without the fear of being scammed</h1>
          <p>
            Your payment stays in escrow until you confirm the item arrived. If there&apos;s a problem,
            a fair dispute process decides, not whoever shouts loudest.
          </p>
          {APP_DOWNLOAD_URL && (
            <a className="btn" href={APP_DOWNLOAD_URL}>Get the Android app</a>
          )}
        </section>

        <h2>How it works</h2>
        <div className="grid steps">
          {STEPS.map((s, i) => (
            <div className="card" key={s.t}>
              <div className="num">{i + 1}</div>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>

        <h2>Why it&apos;s different</h2>
        <div className="grid feats">
          {FEATURES.map((f) => (
            <div className="card" key={f.t}>
              <div className="ico">{f.ico}</div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </div>
          ))}
        </div>

        <p className="note">
          Prototype: the blockchain part runs on Ethereum&apos;s Sepolia test network, so no real crypto is involved.
        </p>

        <footer>
          Escrow P2P · <a href="/admin/login">Moderator sign-in</a>
        </footer>
      </div>
    </div>
  );
}
