'use client'

export default function GlobalChat() {
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
        rel="stylesheet"
      />

      <div className="screen">
        <div className="header">
          <div className="logo">
            <img src="/spreadz-logo.png" alt="SpreadZ" className="logo-img" />
          </div>

          <button className="settings-btn" aria-label="Settings">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>

        <div className="ai-card-wrap">
          <div className="ai-card">
            <div className="ai-headline">
              "Engineers split on whether AI raises the bar — or kills entry-level jobs"
            </div>
          </div>
        </div>

        <div className="messages">
          <div className="msg">
            <div className="avatar c1">SR</div>
            <div className="msg-body">
              <div className="msg-top">
                <span className="msg-name">Sofia Ramirez</span>
                <span className="msg-time">now</span>
              </div>
              <div className="msg-college">MIT</div>
              <div className="msg-text">AI won't replace devs — it'll replace the ones who don't use it.</div>
            </div>
          </div>

          <div className="msg">
            <div className="avatar c2">AL</div>
            <div className="msg-body">
              <div className="msg-top">
                <span className="msg-name">Ava Lawson</span>
                <span className="msg-time">1m</span>
              </div>
              <div className="msg-college">Stanford University</div>
              <div className="msg-text">Easy to say when you already have a job lol. Fresh grads are cooked.</div>
            </div>
          </div>

          <div className="msg">
            <div className="avatar c4">MW</div>
            <div className="msg-body">
              <div className="msg-top">
                <span className="msg-name">Marcus Webb</span>
                <span className="msg-time">2m</span>
              </div>
              <div className="msg-college">Carnegie Mellon</div>
              <div className="msg-text">Built my whole MVP with AI. No team. The moat is speed + ideas now.</div>
            </div>
          </div>

          <div className="msg">
            <div className="avatar c5">JR</div>
            <div className="msg-body">
              <div className="msg-top">
                <span className="msg-name">Jake Reynolds</span>
                <span className="msg-time">3m</span>
              </div>
              <div className="msg-college">UC Berkeley</div>
              <div className="msg-text">"Prompt engineering" as a real skill 💀 it's literally just talking.</div>
            </div>
          </div>

          <div className="msg">
            <div className="avatar c3">NT</div>
            <div className="msg-body">
              <div className="msg-top">
                <span className="msg-name">Noah Torres</span>
                <span className="msg-time">4m</span>
              </div>
              <div className="msg-college">Georgia Tech</div>
              <div className="msg-text">Systems thinking doesn't go away. AI kills the boring parts.</div>
            </div>
          </div>

          <div className="typing-row">
            <div className="avatar c1">SC</div>
            <div>
              <div style={{ fontSize: '12px', color: '#636366', marginBottom: '5px' }}>
                Sofia Chen · Harvard
              </div>
              <div className="typing-dots">
                <div className="td"></div>
                <div className="td"></div>
                <div className="td"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="input-area">
          <div className="hint">↕ swipe for new people & topics</div>
          <div className="input-wrap">
            <input type="text" placeholder="What's on your mind?" />
            <button className="send-btn" aria-label="Send">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#071a03"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <style>{`
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #1c1c1e;
    --surface: #2c2c2e;
    --border: #3a3a3c;
    --border-light: #48484a;
    --neon: #39ff14;
    --text: #f2f2f7;
    --text-sub: #ababab;
    --text-dim: #636366;
  }

  html, body { height: 100%; }

  body {
    background: var(--bg);
    font-family: 'Inter', sans-serif;
    min-height: 100vh;
  }

  .screen {
    width: 100%;
    min-height: 100vh;
    background: var(--bg);
    display: flex;
    flex-direction: column;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 8px;
    padding-bottom: 8px;
    padding-left: 18px;
    padding-right: 18px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    overflow: visible;
    position: relative;
    z-index: 10;
  }

  .logo {
    display: flex;
    align-items: center;
    position: relative;
    z-index: 10;
  }

  .logo-img {
    height: 90px;
    width: auto;
    object-fit: contain;
    position: relative;
    z-index: 10;
    margin: -16px 0;
  }

  .settings-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-dim);
    display: flex;
    align-items: center;
    padding: 4px;
    transition: color 0.15s;
  }

  .settings-btn:hover { color: var(--text-sub); }

  .ai-card-wrap {
    margin: 12px 14px;
    position: relative;
  }

  .ai-card-wrap::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at 30% 60%, rgba(57,255,20,0.12) 0%, transparent 65%),
                radial-gradient(ellipse at 80% 20%, rgba(100,180,255,0.10) 0%, transparent 60%);
    pointer-events: none;
  }

  .ai-card {
    position: relative;
    background: linear-gradient(155deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.07) 45%, rgba(255,255,255,0.04) 100%);
    backdrop-filter: blur(80px) saturate(200%) brightness(1.15);
    -webkit-backdrop-filter: blur(80px) saturate(200%) brightness(1.15);
    border-radius: 22px;
    padding: 16px 20px;
    overflow: hidden;
    box-shadow: 0 0 0 1px rgba(255,255,255,0.13), 0 4px 6px rgba(0,0,0,0.35), 0 16px 48px rgba(0,0,0,0.6), inset 0 2px 8px rgba(255,255,255,0.18), inset 0 -3px 10px rgba(0,0,0,0.28);
  }

  .ai-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 8%;
    right: 8%;
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 20%, rgba(255,255,255,0.95) 50%, rgba(255,255,255,0.55) 80%, transparent 100%);
  }

  .ai-card::after {
    content: '';
    position: absolute;
    inset: 1px;
    border-radius: 21px;
    background: linear-gradient(170deg, rgba(255,255,255,0.09) 0%, transparent 55%, rgba(0,0,0,0.06) 100%);
    pointer-events: none;
  }

  .ai-headline {
    font-size: 15px;
    font-weight: 500;
    color: rgba(235,245,255,0.95);
    line-height: 1.5;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .messages::-webkit-scrollbar { display: none; }

  .msg {
    display: flex;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid #252527;
    cursor: pointer;
    transition: background 0.12s;
  }

  .msg:hover { background: rgba(255,255,255,0.02); }

  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 15px;
  }

  .msg-body { flex: 1; min-width: 0; }

  .msg-top {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 2px;
  }

  .msg-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
  }

  .msg-time {
    font-size: 12px;
    color: var(--text-dim);
    margin-left: auto;
    flex-shrink: 0;
  }

  .msg-college {
    font-size: 12px;
    color: var(--text-dim);
    margin-bottom: 6px;
  }

  .msg-text {
    font-size: 14px;
    color: #d1d1d6;
    line-height: 1.5;
  }

  .typing-row {
    display: flex;
    gap: 12px;
    padding: 14px 18px;
    align-items: center;
  }

  .typing-dots {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .td {
    width: 6px;
    height: 6px;
    background: var(--text-dim);
    border-radius: 50%;
    animation: tbounce 1.2s infinite;
  }

  .td:nth-child(2) { animation-delay: .2s; }
  .td:nth-child(3) { animation-delay: .4s; }

  @keyframes tbounce {
    0%, 60%, 100% { transform: translateY(0); opacity: .35; }
    30% { transform: translateY(-4px); opacity: 1; }
  }

  .input-area {
    background: var(--bg);
    padding: 12px 16px 16px;
    border-top: 1px solid var(--border);
  }

  .hint {
    text-align: center;
    font-size: 11px;
    color: var(--text-dim);
    padding: 0 0 10px;
    opacity: 0.7;
  }

  .input-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--surface);
    border: 1px solid var(--border-light);
    border-radius: 24px;
    padding: 10px 10px 10px 16px;
    transition: border-color 0.15s;
  }

  .input-wrap:focus-within { border-color: rgba(57,255,20,0.4); }

  input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    font-family: 'Inter', sans-serif;
    font-size: 15px;
    color: var(--text);
  }

  input::placeholder { color: var(--text-dim); }

  .send-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--neon);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 0 14px rgba(57,255,20,0.5);
    transition: opacity 0.15s;
  }

  .send-btn:hover { opacity: .85; }

  .c1 { background: #2c2442; color: #a78bfa; }
  .c2 { background: #2a1a1a; color: #f87171; }
  .c3 { background: #162416; color: #4ade80; }
  .c4 { background: #2a2210; color: #fbbf24; }
  .c5 { background: #101e2e; color: #60a5fa; }
      `}</style>
    </>
  )
}
