import { useState, useEffect } from "react";

// Set your Anthropic API key in Vercel as: VITE_ANTHROPIC_API_KEY
const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || "";

// ═══════════════════════════════════════════════════════════════
// CLAUDE AI ENGINE
// ═══════════════════════════════════════════════════════════════
const HEADERS = {
  "Content-Type": "application/json",
  "x-api-key": API_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
};

async function callClaude(messages, maxTokens = 1800, useSearch = false) {
  const body = { model: "claude-sonnet-4-20250514", max_tokens: maxTokens, messages };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: HEADERS, body: JSON.stringify(body),
  });
  if (!res.ok) { const err = await res.text(); console.error("API error", res.status, err); throw new Error(`API ${res.status}`); }
  const data = await res.json();
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
}

async function claudeJSON(prompt, maxTokens = 1800) {
  try {
    const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const text = await callClaude([{ role: "user", content: `Today is ${todayStr}. ${prompt}

Respond ONLY with a valid JSON array. No markdown, no backticks, no explanation.` }], maxTokens, true);
    const clean = text.replace(/\`\`\`json|\`\`\`/g, "").trim();
    const start = clean.indexOf("["); const end = clean.lastIndexOf("]");
    if (start === -1 || end === -1) throw new Error("No JSON array");
    return JSON.parse(clean.slice(start, end + 1));
  } catch (e) { console.error("claudeJSON error:", e.message); return null; }
}

async function claudeText(prompt, maxTokens = 900) {
  try { return await callClaude([{ role: "user", content: prompt }], maxTokens, true); }
  catch (e) { console.error("claudeText error:", e.message); return "Analysis unavailable. Please try again."; }
}



// ═══════════════════════════════════════════════════════════════
// PERSISTENT LEARNING AGENT
// ═══════════════════════════════════════════════════════════════
const AGENT_KEY = "agent-memory";
const PICKS_HISTORY_KEY = "picks-history";

function getAgentMemory() {
  try {
    const raw = localStorage.getItem(AGENT_KEY);
    return raw ? JSON.parse(raw) : {
      totalPicks: 0, wins: 0, losses: 0, pushes: 0,
      leaguePerf: {}, betTypePerf: {}, bookPerf: {},
      patterns: [], insights: [], lastUpdated: null,
      modelVersion: 1, confidenceCalibration: {},
      weatherImpact: {}, homeAwayBias: { home: 0, away: 0 },
    };
  } catch { return { totalPicks: 0, wins: 0, losses: 0, pushes: 0, leaguePerf: {}, betTypePerf: {}, bookPerf: {}, patterns: [], insights: [], lastUpdated: null, modelVersion: 1, confidenceCalibration: {}, weatherImpact: {}, homeAwayBias: { home: 0, away: 0 } }; }
}

function saveAgentMemory(mem) {
  try { localStorage.setItem(AGENT_KEY, JSON.stringify({ ...mem, lastUpdated: new Date().toISOString() })); } catch {}
}

function getPicksHistory() {
  try { const r = localStorage.getItem(PICKS_HISTORY_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}

function savePickResult(pick, result) {
  const history = getPicksHistory();
  history.unshift({ ...pick, result, resolvedAt: new Date().toISOString() });
  if (history.length > 200) history.pop();
  try { localStorage.setItem(PICKS_HISTORY_KEY, JSON.stringify(history)); } catch {}

  const mem = getAgentMemory();
  mem.totalPicks++;
  if (result === "win") mem.wins++;
  else if (result === "loss") mem.losses++;
  else mem.pushes++;

  const league = pick.league;
  if (!mem.leaguePerf[league]) mem.leaguePerf[league] = { wins: 0, losses: 0 };
  if (result === "win") mem.leaguePerf[league].wins++;
  else if (result === "loss") mem.leaguePerf[league].losses++;

  const bt = pick.betType;
  if (!mem.betTypePerf[bt]) mem.betTypePerf[bt] = { wins: 0, losses: 0 };
  if (result === "win") mem.betTypePerf[bt].wins++;
  else if (result === "loss") mem.betTypePerf[bt].losses++;

  saveAgentMemory(mem);
}

// ═══════════════════════════════════════════════════════════════
// SPORTSBOOKS (SC-legal)
// ═══════════════════════════════════════════════════════════════
const BOOKS = [
  { name: "DraftKings", logo: "DK", color: "#1b8c1e", url: "https://sportsbook.draftkings.com" },
  { name: "FanDuel", logo: "FD", color: "#1877f2", url: "https://sportsbook.fanduel.com" },
  { name: "BetMGM", logo: "MGM", color: "#b8932a", url: "https://sports.betmgm.com" },
  { name: "Caesars", logo: "CZR", color: "#003087", url: "https://sportsbook.caesars.com" },
  { name: "ESPN Bet", logo: "ESPN", color: "#cc0000", url: "https://espnbet.com" },
];

const FANTASY_PLATFORMS = [
  { name: "PrizePicks", logo: "PP", color: "#00c851", url: "https://app.prizepicks.com", available: true },
  { name: "Underdog", logo: "UD", color: "#ff6b35", url: "https://underdogfantasy.com", available: true },
  { name: "Sleeper", logo: "SL", color: "#7c4dff", url: "https://sleeper.com", available: true },
  { name: "Yahoo DFS", logo: "YH", color: "#6001d2", url: "https://sports.yahoo.com/dailyfantasy", available: true },
];

const LEAGUES = ["NBA", "NFL", "EPL", "La Liga", "MLS", "Liga MX"];

function bookOdds(base) {
  return BOOKS.map((b, i) => ({ ...b, odds: base + ([-5, 3, 8, -10, 5][i] || 0) }))
    .sort((a, b) => b.odds - a.odds);
}

function fmtOdds(n) { if (!n) return "N/A"; return n > 0 ? `+${n}` : `${n}`; }
function confClass(c) { const n = parseInt(c); return n >= 72 ? "high" : n >= 60 ? "med" : "low"; }
function winPct(w, l) { const t = w + l; return t ? `${Math.round((w / t) * 100)}%` : "—"; }

// ═══════════════════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=Syne+Mono&family=DM+Sans:wght@300;400;500;600&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --ink:#0c0e14;--ink2:#121520;--ink3:#181c28;--ink4:#1e2232;
  --lime:#c6f135;--lime2:#d4f55e;--cyan:#00e5c8;
  --text:#e8ecf5;--muted:#5a6080;--muted2:#3a3f58;
  --green:#00e87a;--red:#ff3d5a;--amber:#ffb547;--purple:#a78bfa;
  --border:rgba(198,241,53,0.1);--border2:rgba(255,255,255,0.06);
}
body{font-family:'DM Sans',sans-serif;background:var(--ink);color:var(--text);min-height:100vh}
.app{max-width:430px;margin:0 auto;min-height:100vh;background:var(--ink);padding-bottom:88px;position:relative}

/* header */
.hdr{padding:16px 18px 0;position:sticky;top:0;z-index:100;background:rgba(12,14,20,0.97);backdrop-filter:blur(20px);border-bottom:1px solid var(--border2)}
.hdr-top{display:flex;align-items:center;justify-content:space-between;padding-bottom:12px}
.logo{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:var(--lime)}
.logo span{color:var(--text);font-weight:400}
.status-dot{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);font-family:'Syne Mono',monospace}
.live-dot{width:7px;height:7px;border-radius:50%;background:var(--green);animation:livepulse 1.5s infinite}
@keyframes livepulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(0,232,122,.5)}50%{opacity:.6;box-shadow:0 0 0 5px rgba(0,232,122,0)}}

/* league tabs */
.ltabs{display:flex;gap:0;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid var(--border2)}
.ltabs::-webkit-scrollbar{display:none}
.ltab{flex-shrink:0;background:none;border:none;border-bottom:2px solid transparent;color:var(--muted);font-family:'Syne',sans-serif;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:10px 14px;cursor:pointer;transition:all .2s;white-space:nowrap}
.ltab.active{color:var(--lime);border-bottom-color:var(--lime)}

/* bottom nav */
.bnav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:430px;background:rgba(18,21,32,.97);backdrop-filter:blur(20px);border-top:1px solid var(--border2);display:flex;z-index:200;padding:4px 0 10px}
.nbtn{flex:1;background:none;border:none;color:var(--muted);padding:8px 2px 2px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;transition:color .2s;font-family:'Syne',sans-serif}
.nbtn.active{color:var(--lime)}
.nico{font-size:19px;line-height:1}

/* cards */
.card{background:var(--ink2);border:1px solid var(--border2);border-radius:18px;margin:0 14px 12px;overflow:hidden;animation:fadeup .35s ease both}
@keyframes fadeup{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}

.card-hdr{padding:14px 16px 10px;display:flex;justify-content:space-between;align-items:flex-start}
.league-chip{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);font-family:'Syne Mono',monospace}
.conf-pill{display:flex;align-items:center;gap:5px;background:var(--ink3);border:1px solid var(--border2);border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;color:var(--lime);font-family:'Syne',sans-serif}
.cdot{width:6px;height:6px;border-radius:50%;animation:livepulse 2s infinite}
.cdot.high{background:var(--green)} .cdot.med{background:var(--amber)} .cdot.low{background:var(--red)}

.game-title{font-family:'Syne',sans-serif;font-size:11px;color:var(--muted);margin-bottom:5px;padding:0 16px}
.pick-name{font-family:'Syne',sans-serif;font-size:21px;font-weight:800;color:var(--text);padding:0 16px;line-height:1.15;margin-bottom:3px}
.pick-meta{font-size:12px;color:var(--muted);padding:0 16px 10px;display:flex;gap:10px;align-items:center}
.pick-odds{font-family:'Syne Mono',monospace;font-size:15px;color:var(--lime)}

/* deep analysis accordion */
.analysis-section{border-top:1px solid var(--border2);cursor:pointer}
.analysis-toggle{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;font-size:12px;font-weight:600;color:var(--muted);font-family:'Syne',sans-serif;letter-spacing:.5px;text-transform:uppercase}
.analysis-body{padding:0 16px 14px;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.intel-block{background:var(--ink3);border:1px solid var(--border2);border-radius:10px;padding:9px 11px}
.intel-label{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:4px;font-family:'Syne',sans-serif}
.intel-val{font-size:13px;color:var(--text);line-height:1.4}
.intel-val.good{color:var(--green)} .intel-val.bad{color:var(--red)} .intel-val.warn{color:var(--amber)}

/* reasoning */
.reason-box{padding:12px 16px;background:rgba(198,241,53,0.04);border-top:1px solid var(--border);font-size:13px;color:#b8c0d8;line-height:1.6}
.reason-label{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--lime);margin-bottom:6px;font-family:'Syne',sans-serif}

/* edge bar */
.edge-wrap{padding:10px 16px 14px;background:var(--ink3);border-top:1px solid var(--border2)}
.edge-row{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:5px}
.edge-pct{color:var(--green);font-weight:700;font-family:'Syne Mono',monospace}
.ebar{height:3px;background:var(--border2);border-radius:2px;overflow:hidden}
.ebar-fill{height:100%;background:linear-gradient(90deg,var(--lime),var(--cyan));border-radius:2px;transition:width 1.2s ease}

/* where to bet */
.wtb{background:var(--ink3);border-top:1px solid var(--border2);padding:12px 16px 14px}
.wtb-label{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:9px;font-family:'Syne',sans-serif}
.book-row{display:flex;gap:7px}
.bpill{display:flex;flex-direction:column;align-items:center;gap:3px;background:var(--ink2);border:1px solid var(--border2);border-radius:11px;padding:8px 10px;cursor:pointer;transition:all .2s;text-decoration:none;min-width:72px}
.bpill:hover,.bpill.best{border-color:var(--lime)}
.bpill.best{background:rgba(198,241,53,0.06)}
.blog{width:28px;height:28px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:900;color:white;flex-shrink:0}
.bname{font-size:10px;font-weight:600;color:var(--text)}
.bodds{font-family:'Syne Mono',monospace;font-size:14px;color:var(--lime)}
.bbest{font-size:9px;color:var(--green);font-weight:700}

/* result buttons */
.result-row{display:flex;gap:6px;padding:10px 16px;border-top:1px solid var(--border2)}
.rbtn{flex:1;background:var(--ink3);border:1px solid var(--border2);border-radius:9px;padding:7px;font-size:11px;font-weight:600;cursor:pointer;color:var(--muted);font-family:'Syne',sans-serif;transition:all .15s}
.rbtn.win{border-color:var(--green);color:var(--green);background:rgba(0,232,122,.08)}
.rbtn.loss{border-color:var(--red);color:var(--red);background:rgba(255,61,90,.08)}
.rbtn.push{border-color:var(--amber);color:var(--amber);background:rgba(255,181,71,.08)}

/* loader */
.loader{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:70px 24px;gap:14px}
.lring{width:44px;height:44px;border:2px solid var(--border2);border-top:2px solid var(--lime);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.ltxt{font-family:'Syne',sans-serif;font-size:14px;color:var(--muted)}
.lsub{font-size:12px;color:var(--muted);text-align:center;max-width:240px;line-height:1.5;opacity:.6}

/* section header */
.shdr{display:flex;justify-content:space-between;align-items:center;padding:18px 16px 8px}
.shdr h2{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;color:var(--text)}
.shdr span{font-size:11px;color:var(--muted);font-family:'Syne Mono',monospace}

/* agent screen */
.agent-card{background:var(--ink2);border:1px solid var(--border2);border-radius:18px;margin:0 14px 12px;padding:18px;animation:fadeup .35s ease both}
.agent-stat-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px}
.astat{background:var(--ink3);border-radius:10px;padding:10px 8px;text-align:center}
.astat-val{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--lime)}
.astat-lbl{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:2px;font-weight:600}
.perf-row{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border2)}
.perf-row:last-child{border-bottom:none}
.perf-name{font-size:13px;font-weight:500}
.perf-bar-wrap{flex:1;margin:0 12px;height:4px;background:var(--border2);border-radius:2px;overflow:hidden}
.perf-bar{height:100%;background:linear-gradient(90deg,var(--lime),var(--cyan));border-radius:2px}
.perf-pct{font-family:'Syne Mono',monospace;font-size:12px;color:var(--lime)}
.insight-chip{background:var(--ink3);border:1px solid var(--border);border-radius:10px;padding:9px 12px;margin-bottom:8px;font-size:13px;color:#b8c0d8;line-height:1.5}

/* fantasy screen */
.fcard{background:var(--ink2);border:1px solid var(--border2);border-radius:18px;margin:0 14px 12px;overflow:hidden;animation:fadeup .35s ease both}
.fcard-hdr{padding:14px 16px 10px;display:flex;justify-content:space-between;align-items:center}
.player-name{font-family:'Syne',sans-serif;font-size:17px;font-weight:800}
.player-team{font-size:11px;color:var(--muted)}
.proj-pill{background:var(--ink3);border:1px solid var(--border);border-radius:20px;padding:4px 12px;font-family:'Syne Mono',monospace;font-size:14px;color:var(--lime);font-weight:700}
.prop-row{display:flex;justify-content:space-between;align-items:center;padding:9px 16px;border-top:1px solid var(--border2)}
.prop-stat{font-size:12px;color:var(--muted);font-weight:500}
.prop-line{font-family:'Syne Mono',monospace;font-size:13px;color:var(--text)}
.prop-rec{font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px}
.prop-rec.over{background:rgba(0,232,122,.1);color:var(--green);border:1px solid rgba(0,232,122,.3)}
.prop-rec.under{background:rgba(255,61,90,.1);color:var(--red);border:1px solid rgba(255,61,90,.3)}
.fplatform-row{display:flex;gap:8px;padding:10px 16px 12px;border-top:1px solid var(--border2)}
.fplat{display:flex;align-items:center;gap:6px;background:var(--ink3);border:1px solid var(--border2);border-radius:9px;padding:6px 10px;text-decoration:none;cursor:pointer;transition:border-color .2s}
.fplat:hover{border-color:var(--lime)}
.fplat-logo{width:22px;height:22px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:900;color:white}
.fplat-name{font-size:10px;font-weight:600;color:var(--text)}

/* ask bar */
.ask-wrap{padding:0 14px 14px}
.ask-row{display:flex;gap:8px}
.ask-inp{flex:1;background:var(--ink2);border:1px solid var(--border2);border-radius:12px;padding:12px 14px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:14px;outline:none;transition:border-color .2s}
.ask-inp:focus{border-color:var(--lime)}
.ask-inp::placeholder{color:var(--muted)}
.ask-btn{background:var(--lime);color:var(--ink);border:none;border-radius:12px;padding:12px 18px;font-weight:700;font-size:13px;cursor:pointer;font-family:'Syne',sans-serif;transition:opacity .2s;white-space:nowrap}
.ask-btn:disabled{opacity:.4;cursor:default}
.ans-card{background:var(--ink2);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:10px;animation:fadeup .3s ease}
.ans-q{font-size:12px;font-weight:600;color:var(--lime);margin-bottom:7px;font-family:'Syne',sans-serif}
.ans-a{font-size:13px;color:#b8c0d8;line-height:1.65}
.sugg-btn{background:var(--ink2);border:1px solid var(--border2);border-radius:10px;padding:10px 14px;margin-bottom:7px;cursor:pointer;font-size:13px;color:#9099b8;display:flex;justify-content:space-between;align-items:center;transition:border-color .2s;width:100%}
.sugg-btn:hover{border-color:var(--lime)}

.disc{font-size:10px;color:var(--muted);text-align:center;padding:6px 16px 14px;opacity:.55;line-height:1.5}
.sc-badge{background:rgba(198,241,53,.07);border:1px solid var(--border);border-radius:8px;padding:6px 12px;display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--lime);font-family:'Syne',sans-serif;font-weight:600;margin:0 14px 12px}

.refresh-btn{background:var(--ink3);border:1px solid var(--border2);border-radius:9px;padding:6px 14px;font-size:11px;font-weight:600;color:var(--muted);cursor:pointer;font-family:'Syne',sans-serif;transition:border-color .2s}
.refresh-btn:hover{border-color:var(--lime);color:var(--lime)}
`;

// ═══════════════════════════════════════════════════════════════
// DEEP PICK CARD
// ═══════════════════════════════════════════════════════════════
function PickCard({ pick, idx, onResult }) {
  const [expanded, setExpanded] = useState(false);
  const [resultSet, setResultSet] = useState(null);
  const books = bookOdds(pick.odds);

  function handleResult(r) {
    setResultSet(r);
    savePickResult(pick, r);
    if (onResult) onResult();
  }

  const intel = pick.intel || {};

  return (
    <div className="card" style={{ animationDelay: `${idx * 0.06}s` }}>
      <div className="card-hdr">
        <div className="league-chip">{pick.league} · {pick.time}</div>
        <div className="conf-pill">
          <div className={`cdot ${confClass(pick.confidence)}`} />
          {pick.confidence}%
        </div>
      </div>
      <div className="game-title">{pick.game}</div>
      <div className="pick-name">{pick.pick}</div>
      <div className="pick-meta">
        <span className="pick-odds">{fmtOdds(pick.odds)}</span>
        <span>·</span>
        <span>{pick.betType}</span>
        {pick.isHome !== undefined && <span>· {pick.isHome ? "🏠 Home" : "✈️ Away"}</span>}
      </div>

      {/* Deep Intel Accordion */}
      <div className="analysis-section" onClick={() => setExpanded(!expanded)}>
        <div className="analysis-toggle">
          <span>⚡ Deep Intel</span>
          <span style={{ transition: "transform .2s", transform: expanded ? "rotate(180deg)" : "none", display: "inline-block" }}>▾</span>
        </div>
        {expanded && (
          <div className="analysis-body">
            <div className="intel-block">
              <div className="intel-label">🌤 Weather</div>
              <div className={`intel-val ${intel.weatherImpact === "positive" ? "good" : intel.weatherImpact === "negative" ? "bad" : ""}`}>{intel.weather || "Indoors / N/A"}</div>
            </div>
            <div className="intel-block">
              <div className="intel-label">🏠 Home/Away</div>
              <div className="intel-val">{intel.homeAway || (pick.isHome ? "Home side" : "Away side")}</div>
            </div>
            <div className="intel-block">
              <div className="intel-label">🤕 Injuries</div>
              <div className={`intel-val ${intel.injuryImpact === "negative" ? "bad" : "warn"}`}>{intel.injuries || "No key absences"}</div>
            </div>
            <div className="intel-block">
              <div className="intel-label">🔄 Rotation</div>
              <div className="intel-val">{intel.rotation || "Standard lineup"}</div>
            </div>
            <div className="intel-block">
              <div className="intel-label">📐 Corners/Fouls</div>
              <div className="intel-val">{intel.cornersOrFouls || "Avg rate expected"}</div>
            </div>
            <div className="intel-block">
              <div className="intel-label">📋 Game Plan</div>
              <div className="intel-val">{intel.gamePlan || "No major changes"}</div>
            </div>
            <div className="intel-block">
              <div className="intel-label">📈 Form (L5)</div>
              <div className="intel-val good">{intel.form || "Checking…"}</div>
            </div>
            <div className="intel-block">
              <div className="intel-label">🔢 H2H</div>
              <div className="intel-val">{intel.h2h || "Recent data"}</div>
            </div>
          </div>
        )}
      </div>

      {/* Reasoning */}
      <div className="reason-box">
        <div className="reason-label">AI Analysis</div>
        {pick.reason}
      </div>

      {/* Edge */}
      <div className="edge-wrap">
        <div className="edge-row"><span>Model Edge</span><span className="edge-pct">+{pick.edge}%</span></div>
        <div className="ebar"><div className="ebar-fill" style={{ width: `${Math.min(pick.edge * 6, 100)}%` }} /></div>
      </div>

      {/* Where to bet */}
      <div className="wtb">
        <div className="wtb-label">Where to bet in South Carolina</div>
        <div className="book-row">
          {books.slice(0, 4).map((b, bi) => (
            <a key={bi} className={`bpill ${bi === 0 ? "best" : ""}`} href={b.url} target="_blank" rel="noopener noreferrer">
              <div className="blog" style={{ background: b.color }}>{b.logo}</div>
              <div className="bname">{b.name}</div>
              <div className="bodds">{fmtOdds(b.odds)}</div>
              {bi === 0 && <div className="bbest">★ Best</div>}
            </a>
          ))}
        </div>
      </div>

      {/* Log result */}
      {!resultSet && (
        <div className="result-row">
          <div style={{ fontSize: 10, color: "var(--muted)", alignSelf: "center", fontFamily: "Syne, sans-serif", fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase", marginRight: 4 }}>Log:</div>
          {["win", "loss", "push"].map(r => (
            <button key={r} className={`rbtn ${r}`} onClick={() => handleResult(r)}>
              {r === "win" ? "✓ Win" : r === "loss" ? "✗ Loss" : "~ Push"}
            </button>
          ))}
        </div>
      )}
      {resultSet && (
        <div className="result-row" style={{ justifyContent: "center" }}>
          <span style={{ fontSize: 12, color: resultSet === "win" ? "var(--green)" : resultSet === "loss" ? "var(--red)" : "var(--amber)", fontFamily: "Syne, sans-serif", fontWeight: 700 }}>
            {resultSet === "win" ? "✓ Logged as WIN — Agent learning..." : resultSet === "loss" ? "✗ Logged as LOSS — Agent adjusting..." : "~ PUSH logged"}
          </span>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PICKS SCREEN
// ═══════════════════════════════════════════════════════════════
function PicksScreen({ picks, loading, league, setLeague, onRefresh, onResult }) {
  const filtered = league === "ALL" ? picks : picks.filter(p => {
    const map = { EPL: "Premier League", "La Liga": "La Liga", MX: "Liga MX" };
    return p.league === (map[league] || league);
  });

  return (
    <>
      {/* League filter */}
      <div className="ltabs">
        {["ALL", "NBA", "NFL", "EPL", "La Liga", "MLS", "MX"].map(l => (
          <button key={l} className={`ltab ${league === l ? "active" : ""}`} onClick={() => setLeague(l)}>{l}</button>
        ))}
      </div>

      {loading && (
        <div className="loader">
          <div className="lring" />
          <div className="ltxt">Running deep analysis…</div>
          <div className="lsub">Scanning injuries, weather, lineups, form, head-to-head, odds movement & game plans across all 6 leagues.</div>
        </div>
      )}

      {!loading && (
        <>
          <div className="sc-badge">📍 South Carolina — DK, FD, BetMGM, Caesars, ESPN Bet available</div>
          {filtered.map((p, i) => <PickCard key={i} pick={p} idx={i} onResult={onResult} />)}
          <div className="disc">Analysis for informational purposes only. You must be 21+ and in South Carolina to use these sportsbooks. Gamble responsibly.</div>
        </>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// FANTASY SCREEN
// ═══════════════════════════════════════════════════════════════
function FantasyCard({ player, idx }) {
  return (
    <div className="fcard" style={{ animationDelay: `${idx * 0.06}s` }}>
      <div className="fcard-hdr">
        <div>
          <div className="player-name">{player.name}</div>
          <div className="player-team">{player.team} · {player.league} · {player.position}</div>
        </div>
        <div className="proj-pill">{player.projection} {player.projStat}</div>
      </div>

      {(player.props || []).map((prop, pi) => (
        <div className="prop-row" key={pi}>
          <div className="prop-stat">{prop.stat}</div>
          <div className="prop-line">O/U {prop.line}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", margin: "0 8px", flex: 1 }}>{prop.reason}</div>
          <div className={`prop-rec ${prop.rec}`}>{prop.rec === "over" ? "▲ OVER" : "▼ UNDER"}</div>
        </div>
      ))}

      <div className="reason-box" style={{ fontSize: 12 }}>
        <div className="reason-label">Fantasy Intel</div>
        {player.analysis}
      </div>

      <div className="fplatform-row">
        <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "Syne, sans-serif", fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase", alignSelf: "center" }}>Play on:</div>
        {FANTASY_PLATFORMS.map((fp, fi) => (
          <a key={fi} className="fplat" href={fp.url} target="_blank" rel="noopener noreferrer">
            <div className="fplat-logo" style={{ background: fp.color }}>{fp.logo}</div>
            <div className="fplat-name">{fp.name}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function FantasyScreen({ fantasyPicks, fantasyLoading }) {
  return (
    <>
      <div className="ltabs" style={{ borderBottom: "1px solid var(--border2)" }}>
        {["All Props", "NBA", "NFL", "Soccer"].map((l, i) => (
          <button key={i} className={`ltab ${i === 0 ? "active" : ""}`}>{l}</button>
        ))}
      </div>

      {fantasyLoading && (
        <div className="loader">
          <div className="lring" />
          <div className="ltxt">Loading player props…</div>
          <div className="lsub">Analyzing player form, matchups, injury reports & usage for PrizePicks, Underdog & more.</div>
        </div>
      )}

      {!fantasyLoading && (
        <>
          <div className="shdr"><h2>Top Player Props</h2><span>SC: PrizePicks ✓</span></div>
          {fantasyPicks.map((p, i) => <FantasyCard key={i} player={p} idx={i} />)}
          <div className="disc">PrizePicks, Underdog, and Sleeper are available in South Carolina. Must be 18+. Play responsibly.</div>
        </>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// AGENT SCREEN
// ═══════════════════════════════════════════════════════════════
function AgentScreen({ agentRefresh }) {
  const [mem, setMem] = useState(getAgentMemory());
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const history = getPicksHistory();

  useEffect(() => { setMem(getAgentMemory()); }, [agentRefresh]);

  async function generateInsights() {
    setLoadingInsights(true);
    const leagueData = JSON.stringify(mem.leaguePerf);
    const betData = JSON.stringify(mem.betTypePerf);
    const txt = await claudeText(
      `You are an AI sports betting learning agent. Based on this performance data:
      Total picks: ${mem.totalPicks}, Wins: ${mem.wins}, Losses: ${mem.losses}
      League performance: ${leagueData}
      Bet type performance: ${betData}
      
      Generate 4 specific, actionable insights to improve the betting strategy. Be concise (1-2 sentences each). If data is sparse, give general tips.`
    );
    // Parse into list
    const lines = txt.split("\n").filter(l => l.trim().length > 10).slice(0, 4);
    setInsights(lines);
    setLoadingInsights(false);
  }

  const winRate = mem.totalPicks > 0 ? Math.round((mem.wins / (mem.wins + mem.losses || 1)) * 100) : 0;
  const roi = mem.totalPicks > 0 ? (((mem.wins * 0.91) - mem.losses) / (mem.wins + mem.losses || 1) * 100).toFixed(1) : "0.0";

  return (
    <>
      <div className="shdr">
        <h2>Learning Agent</h2>
        <span style={{ fontFamily: "Syne Mono, monospace", fontSize: 11, color: "var(--lime)" }}>v{mem.modelVersion}.0</span>
      </div>

      <div className="agent-card">
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", fontFamily: "Syne, sans-serif", marginBottom: 4 }}>Overall Performance</div>
        <div className="agent-stat-grid">
          <div className="astat"><div className="astat-val">{mem.totalPicks}</div><div className="astat-lbl">Picks</div></div>
          <div className="astat"><div className="astat-val" style={{ color: winRate >= 55 ? "var(--green)" : winRate >= 45 ? "var(--amber)" : "var(--red)" }}>{winRate}%</div><div className="astat-lbl">Win Rate</div></div>
          <div className="astat"><div className="astat-val" style={{ color: parseFloat(roi) >= 0 ? "var(--green)" : "var(--red)" }}>{roi}%</div><div className="astat-lbl">ROI</div></div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 12, justifyContent: "center" }}>
          <span style={{ fontSize: 12, color: "var(--green)" }}>✓ {mem.wins}W</span>
          <span style={{ fontSize: 12, color: "var(--red)" }}>✗ {mem.losses}L</span>
          <span style={{ fontSize: 12, color: "var(--amber)" }}>~ {mem.pushes}P</span>
        </div>
      </div>

      {/* League performance */}
      {Object.keys(mem.leaguePerf).length > 0 && (
        <div className="agent-card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", fontFamily: "Syne, sans-serif", marginBottom: 12 }}>By League</div>
          {Object.entries(mem.leaguePerf).map(([lg, d], i) => {
            const pct = parseInt(winPct(d.wins, d.losses));
            return (
              <div key={i} className="perf-row">
                <div className="perf-name">{lg}</div>
                <div className="perf-bar-wrap"><div className="perf-bar" style={{ width: `${isNaN(pct) ? 0 : pct}%` }} /></div>
                <div className="perf-pct">{winPct(d.wins, d.losses)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bet type performance */}
      {Object.keys(mem.betTypePerf).length > 0 && (
        <div className="agent-card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", fontFamily: "Syne, sans-serif", marginBottom: 12 }}>By Bet Type</div>
          {Object.entries(mem.betTypePerf).map(([bt, d], i) => {
            const pct = parseInt(winPct(d.wins, d.losses));
            return (
              <div key={i} className="perf-row">
                <div className="perf-name">{bt}</div>
                <div className="perf-bar-wrap"><div className="perf-bar" style={{ width: `${isNaN(pct) ? 0 : pct}%` }} /></div>
                <div className="perf-pct">{winPct(d.wins, d.losses)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI insights */}
      <div className="agent-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", fontFamily: "Syne, sans-serif" }}>Agent Insights</div>
          <button className="refresh-btn" onClick={generateInsights} disabled={loadingInsights}>{loadingInsights ? "…" : "Generate"}</button>
        </div>
        {loadingInsights && <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "10px 0" }}>Analyzing your patterns…</div>}
        {insights?.map((ins, i) => (
          <div key={i} className="insight-chip">💡 {ins.replace(/^\d+\.\s*/, "").replace(/^[-•]\s*/, "")}</div>
        ))}
        {!insights && !loadingInsights && (
          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
            Log pick results to build your performance database. The agent will study your win/loss patterns and generate personalized insights to improve your strategy over time.
          </div>
        )}
      </div>

      {/* Recent history */}
      {history.length > 0 && (
        <div className="agent-card">
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", fontFamily: "Syne, sans-serif", marginBottom: 12 }}>Recent History</div>
          {history.slice(0, 5).map((h, i) => (
            <div key={i} className="perf-row">
              <div>
                <div className="perf-name" style={{ fontSize: 12 }}>{h.pick}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>{h.game} · {h.league}</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: h.result === "win" ? "var(--green)" : h.result === "loss" ? "var(--red)" : "var(--amber)" }}>
                {h.result === "win" ? "✓ W" : h.result === "loss" ? "✗ L" : "~ P"}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// INSIGHTS SCREEN
// ═══════════════════════════════════════════════════════════════
function InsightsScreen() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [answers, setAnswers] = useState([]);

  const suggestions = [
    "What are today's best value bets in La Liga considering weather & injuries?",
    "Which NBA players are best for PrizePicks tonight?",
    "Are there any rotation changes I should know about in the EPL?",
    "How does cold weather affect NFL over/under totals?",
    "Best MLS props on PrizePicks this week?",
    "What Liga MX teams have the best home record this season?",
  ];

  async function ask(query) {
    const text = query || q;
    if (!text.trim() || loading) return;
    setLoading(true); setQ("");
    const ans = await claudeText(
      `You are an elite sports betting & fantasy sports analyst with access to current data. The user is in South Carolina where DraftKings, FanDuel, BetMGM, Caesars, ESPN Bet, PrizePicks, Underdog and Sleeper are all legal. 
      Answer this with specific, current, actionable advice. Reference injuries, weather, lineup changes, form, home/away splits where relevant. 2-4 sentences: "${text}"`
    );
    setAnswers(prev => [{ q: text, a: ans }, ...prev]);
    setLoading(false);
  }

  return (
    <>
      <div className="shdr"><h2>Ask the Analyst</h2></div>
      <div className="ask-wrap">
        <div className="ask-row">
          <input className="ask-inp" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && ask()} placeholder="Ask about any game, player, or bet…" />
          <button className="ask-btn" onClick={() => ask()} disabled={loading}>{loading ? "…" : "Ask"}</button>
        </div>
      </div>

      {!answers.length && (
        <div style={{ padding: "0 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)", fontFamily: "Syne, sans-serif", marginBottom: 8 }}>Suggested</div>
          {suggestions.map((s, i) => (
            <button key={i} className="sugg-btn" onClick={() => ask(s)}>
              {s}<span style={{ color: "var(--lime)", marginLeft: 8, flexShrink: 0 }}>→</span>
            </button>
          ))}
        </div>
      )}

      {loading && <div className="loader" style={{ padding: "30px" }}><div className="lring" style={{ width: 32, height: 32 }} /><div className="ltxt" style={{ fontSize: 13 }}>Researching…</div></div>}

      <div style={{ padding: "0 14px" }}>
        {answers.map((item, i) => (
          <div key={i} className="ans-card" style={{ animationDelay: `${i * 0.04}s` }}>
            <div className="ans-q">Q: {item.q}</div>
            <div className="ans-a">{item.a}</div>
          </div>
        ))}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
const NAV = [
  { id: "picks", label: "Picks", icon: "🎯" },
  { id: "fantasy", label: "Fantasy", icon: "⚡" },
  { id: "agent", label: "Agent", icon: "🤖" },
  { id: "ask", label: "Ask", icon: "💬" },
];

const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function App() {
  const [screen, setScreen] = useState("picks");
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [league, setLeague] = useState("ALL");
  const [fantasyPicks, setFantasyPicks] = useState([]);
  const [fantasyLoading, setFantasyLoading] = useState(true);
  const [agentRefresh, setAgentRefresh] = useState(0);

  useEffect(() => { loadPicks(); loadFantasy(); }, []);

  async function loadPicks() {
    setLoading(true);
    const mem = getAgentMemory();
    const leagueHints = Object.entries(mem.leaguePerf).length
      ? `The agent has found these league win rates: ${JSON.stringify(mem.leaguePerf)}. Emphasize high-performing leagues.`
      : "";

    const data = await claudeJSON(`
      You are an elite sports intelligence analyst. Using ONLY the confirmed real games listed above for today, generate betting picks.
      For each real game, factor in: current injuries (by name), lineup/rotation changes, weather (outdoor sports), home/away advantage & ATS record, recent form (L5), H2H record, tactical changes, referee tendencies (soccer), pace, travel/fatigue.
      ${leagueHints}

      Return a JSON array — one object per pick, only for games confirmed above:
      {
        "league": "NBA",
        "game": "Team A vs Team B",
        "time": "7:30 PM ET",
        "pick": "Team A -5.5",
        "betType": "Spread",
        "odds": -110,
        "confidence": 74,
        "edge": 7,
        "isHome": true,
        "reason": "3 specific sentences citing real stats, injury names, weather, form.",
        "intel": {
          "weather": "e.g. Indoors — no impact, or 28°F 15mph wind",
          "homeAway": "Team A's actual home ATS record this season",
          "injuries": "Real player names and status",
          "rotation": "Actual rotation notes",
          "cornersOrFouls": "Soccer: corners/fouls avg. NBA/NFL: foul rate or pace",
          "gamePlan": "Tactical or scheme notes",
          "form": "A: W-W-L-W-W | B: L-W-L-L-W",
          "h2h": "Last 10 meetings result"
        }
      }
      CRITICAL: Only include games actually being played today. No invented matchups.
    `, 1800);

    if (Array.isArray(data) && data.length >= 1) setPicks(data);
    else setPicks([{ league: "—", game: "No games found for today", time: "—", pick: "Check back later", betType: "—", odds: 0, confidence: 0, edge: 0, reason: "Could not load today's games. Try refreshing.", intel: {} }]);
    setLoading(false);
  }

  async function loadFantasy() {
    setFantasyLoading(true);
    try {
      const data = await claudeJSON(
        `Search the web for today's NBA, NFL, EPL, MLS, and Liga MX games and confirmed active rosters.
        Generate 6 player prop recommendations for PrizePicks and Underdog Fantasy (both legal in South Carolina).
        CRITICAL RULES:
        - Only include players CONFIRMED playing today (search for today's injury reports)
        - Exclude any player listed as OUT, doubtful, or injured
        - Use real current prop lines from PrizePicks if possible
        - Base recommendations on today's matchup, recent form, and injury context
        
        Return JSON array of 6 objects:
        {
          "name": "Player Full Name",
          "team": "Team Name",
          "league": "NBA",
          "position": "G",
          "projection": "28.5",
          "projStat": "PTS",
          "analysis": "2-3 sentences: why this player hits their prop tonight. Cite specific stats, matchup, injuries.",
          "props": [
            { "stat": "Points", "line": "27.5", "rec": "over", "reason": "specific reason with stats" },
            { "stat": "Assists", "line": "6.5", "rec": "under", "reason": "specific reason" }
          ]
        }`, 1500
      );
      if (Array.isArray(data) && data.length >= 1) setFantasyPicks(data);
      else setFantasyPicks(getFallbackFantasy());
    } catch(e) {
      console.error("loadFantasy error:", e);
      setFantasyPicks(getFallbackFantasy());
    }
    setFantasyLoading(false);
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        {/* Header */}
        <div className="hdr">
          <div className="hdr-top">
            <div className="logo">EDGE<span>IQ</span></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="refresh-btn" onClick={() => { loadPicks(); loadFantasy(); }}>↻ Refresh</button>
              <div className="status-dot"><div className="live-dot" /> LIVE</div>
            </div>
          </div>
        </div>

        {screen === "picks" && <PicksScreen picks={picks} loading={loading} league={league} setLeague={setLeague} onRefresh={loadPicks} onResult={() => setAgentRefresh(r => r + 1)} />}
        {screen === "fantasy" && <FantasyScreen fantasyPicks={fantasyPicks} fantasyLoading={fantasyLoading} />}
        {screen === "agent" && <AgentScreen agentRefresh={agentRefresh} />}
        {screen === "ask" && <InsightsScreen />}

        <div className="bnav">
          {NAV.map(n => (
            <button key={n.id} className={`nbtn ${screen === n.id ? "active" : ""}`} onClick={() => setScreen(n.id)}>
              <span className="nico">{n.icon}</span>{n.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// FALLBACKS
// ═══════════════════════════════════════════════════════════════
function getFallbackPicks() {
  return [{ league: "—", game: "Unable to load today's schedule", time: "—", pick: "Tap ↻ Refresh to try again", betType: "—", odds: 0, confidence: 0, edge: 0, reason: "Live game data could not be retrieved. Please refresh or check your connection.", intel: { weather: "N/A", homeAway: "N/A", injuries: "N/A", rotation: "N/A", cornersOrFouls: "N/A", gamePlan: "N/A", form: "N/A", h2h: "N/A" } }];
}

function getFallbackFantasy() {
  return [{ name: "No props loaded yet", team: "Tap Refresh to load today's real players", league: "—", position: "—", projection: "—", projStat: "", analysis: "Live player data could not be retrieved. Hit the Refresh button at the top to search for today's confirmed active players and their props.", props: [] }];
}
