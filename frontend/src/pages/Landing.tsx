import { Link } from "react-router-dom"

/**
 * Inflow landing page.
 * Self-contained: styles are scoped under the `.ifl` class and injected via <style>,
 * so no changes to index.css / App.css are required. No extra dependencies.
 */

const steps = [
  {
    n: "01",
    title: "Connect Gmail",
    body: "Link your inbox with Google OAuth. Inflow reads incoming mail so you don't have to sort it.",
  },
  {
    n: "02",
    title: "Classify every email",
    body: "An LLM labels each message, separating what needs a reply from receipts, newsletters and noise.",
  },
  {
    n: "03",
    title: "Draft replies",
    body: "For emails that need a response, Inflow writes a draft in context, ready for you to review.",
  },
  {
    n: "04",
    title: "You approve, then it sends",
    body: "Nothing leaves your account until you approve it. Edit, accept or reject every draft.",
  },
]

const features = [
  {
    title: "Human-in-the-loop by design",
    body: "Sending is gated behind explicit approval. The agent proposes, you decide.",
    icon: "M9 12l2 2 4-4M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6l8-3z",
  },
  {
    title: "LLM email triage",
    body: "Every incoming email is classified automatically, so your attention goes to what matters.",
    icon: "M3 5h18M6 12h12M10 19h4",
  },
  {
    title: "Context-aware drafts",
    body: "Replies are drafted for the emails that actually need one, and saved for your review.",
    icon: "M4 20h4l10-10-4-4L4 16v4zM13 7l4 4",
  },
  {
    title: "Gmail-native",
    body: "Works directly with your Gmail account through Google's OAuth, with a scoped connection.",
    icon: "M3 7l9 6 9-6M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z",
  },
  {
    title: "Orchestrated with LangGraph",
    body: "A graph-based agent workflow keeps ingestion, classification, drafting and approval explicit.",
    icon: "M6 6a2 2 0 100-4 2 2 0 000 4zm12 0a2 2 0 100-4 2 2 0 000 4zM12 22a2 2 0 100-4 2 2 0 000 4zM6 6v4a4 4 0 004 4h4a4 4 0 004-4V6M12 14v4",
  },
  {
    title: "Single-user and scoped",
    body: "Built as a focused workflow for one inbox, not a broad automation platform.",
    icon: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  },
]

function Icon({ d }: { d: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

export default function Landing() {
  return (
    <div className="ifl">
      <style>{css}</style>

      {/* Nav */}
      <header className="ifl-nav">
        <div className="ifl-container ifl-nav-inner">
          <Link to="/" className="ifl-logo" aria-label="Inflow home">
            <span className="ifl-logo-mark">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12h10M10 6l6 6-6 6" />
              </svg>
            </span>
            Inflow
          </Link>
          <nav className="ifl-nav-links" aria-label="Primary">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#trust">Control</a>
          </nav>
          <div className="ifl-nav-cta">
            <Link to="/login" className="ifl-btn ifl-btn-ghost">Log in</Link>
            <Link to="/signup" className="ifl-btn ifl-btn-primary">Get started</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="ifl-hero">
        <div className="ifl-glow" aria-hidden="true" />
        <div className="ifl-container ifl-hero-inner">
          <span className="ifl-pill">
            <span className="ifl-dot" /> AI email triage agent for Gmail
          </span>
          <h1>
            Your inbox, triaged.
            <br />
            <span className="ifl-grad">Your replies, approved by you.</span>
          </h1>
          <p className="ifl-lead">
            Inflow connects to Gmail, classifies every incoming email with an LLM, and drafts
            replies for the ones that need a response. Nothing is sent until a human approves it.
          </p>
          <div className="ifl-hero-cta">
            <Link to="/signup" className="ifl-btn ifl-btn-primary ifl-btn-lg">
              Get started
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
            <Link to="/login" className="ifl-btn ifl-btn-outline ifl-btn-lg">Log in</Link>
          </div>
          <p className="ifl-note">Approval-first. You stay in control of every send.</p>

          {/* Product mockup (illustrative) */}
          <div className="ifl-mock" role="img" aria-label="Illustration of the Inflow inbox with a draft awaiting approval">
            <div className="ifl-mock-bar">
              <span /><span /><span />
              <em>Inflow · Inbox</em>
            </div>
            <div className="ifl-mock-body">
              <div className="ifl-mock-list">
                <div className="ifl-row ifl-row-active">
                  <div className="ifl-row-top">
                    <strong>Priya Nair</strong>
                    <span className="ifl-tag ifl-tag-reply">Needs reply</span>
                  </div>
                  <div className="ifl-row-sub">Can we move Thursday's review?</div>
                </div>
                <div className="ifl-row">
                  <div className="ifl-row-top">
                    <strong>Stripe</strong>
                    <span className="ifl-tag ifl-tag-info">FYI</span>
                  </div>
                  <div className="ifl-row-sub">Your invoice is available</div>
                </div>
                <div className="ifl-row">
                  <div className="ifl-row-top">
                    <strong>Product Weekly</strong>
                    <span className="ifl-tag ifl-tag-mute">Newsletter</span>
                  </div>
                  <div className="ifl-row-sub">This week in product design</div>
                </div>
                <div className="ifl-row">
                  <div className="ifl-row-top">
                    <strong>Arjun Mehta</strong>
                    <span className="ifl-tag ifl-tag-reply">Needs reply</span>
                  </div>
                  <div className="ifl-row-sub">Quick question about the proposal</div>
                </div>
              </div>
              <div className="ifl-mock-draft">
                <div className="ifl-draft-head">
                  <span className="ifl-tag ifl-tag-draft">Draft ready</span>
                  <span className="ifl-draft-meta">Awaiting your approval</span>
                </div>
                <div className="ifl-draft-to">To: Priya Nair</div>
                <div className="ifl-draft-text">
                  <p>Hi Priya,</p>
                  <p>
                    Thursday works to move. I'm free Friday morning or early next week, so
                    let me know what suits you best and I'll update the invite.
                  </p>
                  <p>Thanks,</p>
                </div>
                <div className="ifl-draft-actions">
                  <span className="ifl-btn ifl-btn-primary ifl-btn-sm">Approve &amp; send</span>
                  <span className="ifl-btn ifl-btn-outline ifl-btn-sm">Edit</span>
                  <span className="ifl-btn ifl-btn-ghost ifl-btn-sm">Reject</span>
                </div>
              </div>
            </div>
          </div>
          <p className="ifl-caption">Illustrative preview with sample content.</p>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="ifl-section">
        <div className="ifl-container">
          <div className="ifl-head">
            <span className="ifl-eyebrow">How it works</span>
            <h2>From new email to approved reply</h2>
            <p>A clear four-step workflow, with you holding the final decision.</p>
          </div>
          <div className="ifl-steps">
            {steps.map((s) => (
              <div key={s.n} className="ifl-card ifl-step">
                <span className="ifl-step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="ifl-section ifl-section-alt">
        <div className="ifl-container">
          <div className="ifl-head">
            <span className="ifl-eyebrow">Features</span>
            <h2>Focused on the inbox work that drains your day</h2>
            <p>A scoped agentic workflow rather than a sprawling automation tool.</p>
          </div>
          <div className="ifl-grid">
            {features.map((f) => (
              <div key={f.title} className="ifl-card ifl-feature">
                <div className="ifl-icon">
                  <Icon d={f.icon} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust / human in the loop */}
      <section id="trust" className="ifl-section">
        <div className="ifl-container ifl-trust">
          <div className="ifl-trust-copy">
            <span className="ifl-eyebrow">You stay in control</span>
            <h2>The agent drafts. You decide what gets sent.</h2>
            <p>
              Inflow is built around human-in-the-loop approval. It can read, classify and
              draft, but sending only happens after you review and approve a draft.
            </p>
            <ul className="ifl-checks">
              <li>No reply is sent without your approval</li>
              <li>Review and edit every draft before it goes out</li>
              <li>Scoped to a single user and a single inbox</li>
            </ul>
          </div>
          <div className="ifl-flow" aria-label="Approval workflow">
            {["Gmail ingestion", "LLM classification", "Draft reply", "Human approval", "Send"].map(
              (label, i, arr) => (
                <div key={label} className="ifl-flow-item">
                  <div className={"ifl-node" + (label === "Human approval" ? " ifl-node-key" : "")}>
                    {label}
                  </div>
                  {i < arr.length - 1 && <div className="ifl-link" aria-hidden="true" />}
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ifl-cta">
        <div className="ifl-container">
          <div className="ifl-cta-box">
            <h2>Spend less time sorting email.</h2>
            <p>Connect Gmail, review the drafts, and approve what you want sent.</p>
            <div className="ifl-hero-cta">
              <Link to="/signup" className="ifl-btn ifl-btn-light ifl-btn-lg">Get started</Link>
              <Link to="/login" className="ifl-btn ifl-btn-outline-light ifl-btn-lg">Log in</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="ifl-footer">
        <div className="ifl-container ifl-footer-inner">
          <span className="ifl-logo ifl-logo-sm">
            <span className="ifl-logo-mark">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12h10M10 6l6 6-6 6" />
              </svg>
            </span>
            Inflow
          </span>
          <span className="ifl-footer-text">
            © {new Date().getFullYear()} Inflow. AI email triage with human approval.
          </span>
        </div>
      </footer>
    </div>
  )
}

const css = `
.ifl {
  --bg: #07090f;
  --bg-alt: #0b0e17;
  --card: #0f1320;
  --line: rgba(255,255,255,0.08);
  --text: #e8ebf5;
  --muted: #9aa3b8;
  --accent: #6366f1;
  --accent-2: #8b5cf6;
  --accent-3: #22d3ee;
  position: relative;
  width: 100%;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  line-height: 1.55;
  text-align: left;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
}
.ifl *, .ifl *::before, .ifl *::after { box-sizing: border-box; }
.ifl h1, .ifl h2, .ifl h3, .ifl p, .ifl ul { margin: 0; }
.ifl a { color: inherit; text-decoration: none; }
.ifl-container { width: 100%; max-width: 1120px; margin: 0 auto; padding: 0 24px; }

/* Nav */
.ifl-nav { position: sticky; top: 0; z-index: 50; background: rgba(7,9,15,0.72); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-bottom: 1px solid var(--line); }
.ifl-nav-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; gap: 16px; }
.ifl-logo { display: inline-flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; letter-spacing: -0.02em; }
.ifl-logo-sm { font-size: 16px; }
.ifl-logo-mark { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; color: #fff; background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 0 4px 16px rgba(99,102,241,0.45); }
.ifl-nav-links { display: flex; gap: 28px; font-size: 14px; color: var(--muted); }
.ifl-nav-links a { transition: color .15s; }
.ifl-nav-links a:hover { color: var(--text); }
.ifl-nav-cta { display: flex; gap: 8px; }

/* Buttons */
.ifl-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 9px 16px; border-radius: 10px; font-size: 14px; font-weight: 600; border: 1px solid transparent; cursor: pointer; transition: transform .15s, background .15s, border-color .15s, box-shadow .15s; white-space: nowrap; }
.ifl-btn-lg { padding: 13px 22px; font-size: 15px; border-radius: 12px; }
.ifl-btn-sm { padding: 7px 12px; font-size: 12px; border-radius: 8px; cursor: default; }
.ifl-btn-primary { color: #fff; background: linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow: 0 6px 24px rgba(99,102,241,0.35); }
.ifl-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 30px rgba(99,102,241,0.5); }
.ifl-btn-ghost { color: var(--muted); }
.ifl-btn-ghost:hover { color: var(--text); background: rgba(255,255,255,0.05); }
.ifl-btn-outline { color: var(--text); border-color: var(--line); background: rgba(255,255,255,0.03); }
.ifl-btn-outline:hover { border-color: rgba(255,255,255,0.22); background: rgba(255,255,255,0.06); }
.ifl-btn-light { color: #0b0e17; background: #fff; }
.ifl-btn-light:hover { transform: translateY(-1px); box-shadow: 0 10px 30px rgba(255,255,255,0.18); }
.ifl-btn-outline-light { color: #fff; border-color: rgba(255,255,255,0.4); }
.ifl-btn-outline-light:hover { background: rgba(255,255,255,0.12); }

/* Hero */
.ifl-hero { position: relative; padding: 88px 0 72px; overflow: hidden; }
.ifl-glow { position: absolute; inset: -10% 0 auto 0; height: 560px; pointer-events: none;
  background:
    radial-gradient(600px 300px at 25% 20%, rgba(99,102,241,0.30), transparent 70%),
    radial-gradient(520px 280px at 78% 10%, rgba(34,211,238,0.16), transparent 70%),
    radial-gradient(520px 320px at 55% 45%, rgba(139,92,246,0.18), transparent 70%); }
.ifl-hero-inner { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; }
.ifl-pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; font-size: 13px; color: var(--muted); border: 1px solid var(--line); background: rgba(255,255,255,0.04); margin-bottom: 26px; }
.ifl-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent-3); box-shadow: 0 0 10px var(--accent-3); }
.ifl h1 { font-size: clamp(36px, 6vw, 64px); line-height: 1.07; letter-spacing: -0.035em; font-weight: 800; max-width: 820px; }
.ifl-grad { background: linear-gradient(90deg, #a5b4fc, #c4b5fd 45%, #67e8f9); -webkit-background-clip: text; background-clip: text; color: transparent; }
.ifl-lead { margin-top: 22px; max-width: 640px; font-size: clamp(16px, 2vw, 19px); color: var(--muted); }
.ifl-hero-cta { display: flex; gap: 12px; margin-top: 32px; flex-wrap: wrap; justify-content: center; }
.ifl-note { margin-top: 16px; font-size: 13px; color: var(--muted); }

/* Mockup */
.ifl-mock { width: 100%; max-width: 960px; margin-top: 56px; text-align: left; border-radius: 16px; border: 1px solid var(--line); background: linear-gradient(180deg, #0f1424, #0b0e18); box-shadow: 0 40px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02), 0 0 80px rgba(99,102,241,0.15); overflow: hidden; }
.ifl-mock-bar { display: flex; align-items: center; gap: 7px; padding: 12px 16px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,0.02); }
.ifl-mock-bar span { width: 10px; height: 10px; border-radius: 50%; background: rgba(255,255,255,0.14); }
.ifl-mock-bar em { margin-left: 12px; font-style: normal; font-size: 12px; color: var(--muted); }
.ifl-mock-body { display: grid; grid-template-columns: 1fr 1.1fr; min-height: 340px; }
.ifl-mock-list { border-right: 1px solid var(--line); padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.ifl-row { padding: 12px; border-radius: 10px; border: 1px solid transparent; }
.ifl-row-active { background: rgba(99,102,241,0.12); border-color: rgba(99,102,241,0.35); }
.ifl-row-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; }
.ifl-row-sub { margin-top: 3px; font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ifl-tag { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
.ifl-tag-reply { color: #c4b5fd; background: rgba(139,92,246,0.18); }
.ifl-tag-info { color: #67e8f9; background: rgba(34,211,238,0.14); }
.ifl-tag-mute { color: var(--muted); background: rgba(255,255,255,0.07); }
.ifl-tag-draft { color: #86efac; background: rgba(34,197,94,0.15); }
.ifl-mock-draft { padding: 20px; display: flex; flex-direction: column; gap: 12px; }
.ifl-draft-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ifl-draft-meta { font-size: 12px; color: var(--muted); }
.ifl-draft-to { font-size: 13px; color: var(--muted); padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.ifl-draft-text { font-size: 13.5px; color: #cdd3e4; display: flex; flex-direction: column; gap: 10px; }
.ifl-draft-actions { display: flex; gap: 8px; margin-top: auto; padding-top: 8px; flex-wrap: wrap; }
.ifl-caption { margin-top: 14px; font-size: 12px; color: var(--muted); }

/* Sections */
.ifl-section { padding: 96px 0; }
.ifl-section-alt { background: var(--bg-alt); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.ifl-head { text-align: center; max-width: 640px; margin: 0 auto 56px; }
.ifl-eyebrow { display: inline-block; font-size: 12.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #a5b4fc; margin-bottom: 14px; }
.ifl h2 { font-size: clamp(28px, 4vw, 40px); line-height: 1.15; letter-spacing: -0.03em; font-weight: 750; }
.ifl-head p { margin-top: 14px; color: var(--muted); font-size: 17px; }
.ifl h3 { font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }

.ifl-card { padding: 26px; border-radius: 16px; border: 1px solid var(--line); background: linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012)); transition: transform .2s, border-color .2s, background .2s; }
.ifl-card:hover { transform: translateY(-3px); border-color: rgba(129,140,248,0.4); background: linear-gradient(180deg, rgba(99,102,241,0.08), rgba(255,255,255,0.015)); }
.ifl-card p { margin-top: 10px; color: var(--muted); font-size: 14.5px; }

.ifl-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.ifl-step-n { display: inline-block; font-size: 13px; font-weight: 700; color: #a5b4fc; margin-bottom: 18px; font-variant-numeric: tabular-nums; }
.ifl-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.ifl-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; margin-bottom: 18px; color: #c4b5fd; background: rgba(99,102,241,0.14); border: 1px solid rgba(129,140,248,0.25); }

/* Trust */
.ifl-trust { display: grid; grid-template-columns: 1.05fr 1fr; gap: 56px; align-items: center; }
.ifl-trust-copy p { margin-top: 16px; color: var(--muted); font-size: 17px; }
.ifl-checks { list-style: none; padding: 0; margin-top: 24px; display: flex; flex-direction: column; gap: 12px; }
.ifl-checks li { position: relative; padding-left: 30px; font-size: 15px; color: #cdd3e4; }
.ifl-checks li::before { content: ""; position: absolute; left: 0; top: 3px; width: 18px; height: 18px; border-radius: 50%; background: rgba(34,197,94,0.16) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2386efac' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 12.5l4 4 8-9'/%3E%3C/svg%3E") center/12px no-repeat; }
.ifl-flow { display: flex; flex-direction: column; align-items: stretch; padding: 28px; border-radius: 18px; border: 1px solid var(--line); background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01)); }
.ifl-flow-item { display: flex; flex-direction: column; align-items: center; }
.ifl-node { width: 100%; text-align: center; padding: 13px 16px; border-radius: 12px; font-size: 14px; font-weight: 600; border: 1px solid var(--line); background: rgba(255,255,255,0.04); color: #cdd3e4; }
.ifl-node-key { color: #fff; border-color: rgba(129,140,248,0.6); background: linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.3)); box-shadow: 0 0 30px rgba(99,102,241,0.3); }
.ifl-link { width: 2px; height: 18px; background: linear-gradient(180deg, rgba(129,140,248,0.6), rgba(129,140,248,0.15)); }

/* CTA */
.ifl-cta { padding: 24px 0 96px; }
.ifl-cta-box { text-align: center; padding: 64px 28px; border-radius: 24px; background: radial-gradient(500px 220px at 20% 0%, rgba(255,255,255,0.18), transparent 70%), linear-gradient(135deg, #4f46e5, #7c3aed 60%, #0891b2); box-shadow: 0 30px 80px rgba(79,70,229,0.35); }
.ifl-cta-box h2 { color: #fff; }
.ifl-cta-box p { margin-top: 14px; color: rgba(255,255,255,0.82); font-size: 17px; }

/* Footer */
.ifl-footer { border-top: 1px solid var(--line); padding: 28px 0; }
.ifl-footer-inner { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ifl-footer-text { font-size: 13px; color: var(--muted); }

/* Responsive */
@media (max-width: 980px) {
  .ifl-steps { grid-template-columns: repeat(2, 1fr); }
  .ifl-grid { grid-template-columns: repeat(2, 1fr); }
  .ifl-trust { grid-template-columns: 1fr; gap: 36px; }
}
@media (max-width: 760px) {
  .ifl-nav-links { display: none; }
  .ifl-hero { padding: 56px 0 48px; }
  .ifl-mock-body { grid-template-columns: 1fr; }
  .ifl-mock-list { border-right: 0; border-bottom: 1px solid var(--line); }
  .ifl-section { padding: 64px 0; }
}
@media (max-width: 560px) {
  .ifl-steps, .ifl-grid { grid-template-columns: 1fr; }
  .ifl-nav-cta .ifl-btn-ghost { display: none; }
  .ifl-hero-cta .ifl-btn { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .ifl *, .ifl *::before, .ifl *::after { transition: none !important; }
}
html { scroll-behavior: smooth; }
`