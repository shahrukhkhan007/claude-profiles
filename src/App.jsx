import React, { useEffect, useState, useCallback, useRef } from 'react';
import octoHero from './assets/octo-hero.png';
import octoTan from './assets/octo-tan.png';
import octoMark from './assets/octo-mark.png';

const COLORS = ['blue', 'green', 'coral', 'violet', 'slate'];
const TABS = [{ key: 'simple', label: 'Quick Launch' }, { key: 'custom', label: 'Custom' }];
const THEMES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark'], ['darker', 'Darker']];
const REPO = 'https://github.com/shahrukhkhan007/claude-profiles';
const LINKEDIN = 'https://www.linkedin.com/in/profile-shah-rukh-khan/';
const api = typeof window !== 'undefined' ? window.api : undefined;

// Onboarding background: a randomly scattered field of octopuses (varied sizes,
// jittered grid so it reads random, not a diagonal lattice). Each one glows on
// its own staggered cycle, so a few random ones light up and fade at any moment.
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const FIELD = (() => {
  const rnd = mulberry32(7), cols = 8, rows = 7, out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const jx = (rnd() - 0.5) * 0.85, jy = (rnd() - 0.5) * 0.85;
    out.push({
      l: (((c + 0.5) / cols + jx / cols) * 100).toFixed(2) + '%',
      t: (((r + 0.5) / rows + jy / rows) * 100).toFixed(2) + '%',
      s: Math.round(24 + rnd() * 32),
      rot: Math.round((rnd() - 0.5) * 40) + 'deg',
      dx: Math.round((rnd() - 0.5) * 26) + 'px',          // ± left/right drift
      dy: -Math.round(6 + rnd() * 16) + 'px',             // mostly upward
      gdur: (5.75 + rnd() * 3.45).toFixed(2) + 's',        // glow speed (~15% slower)
      gdel: (rnd() * 8).toFixed(2) + 's',
      fdur: (4.15 + rnd() * 3.45).toFixed(2) + 's',        // float speed (~15% slower)
      fdel: (rnd() * 5).toFixed(2) + 's',
    });
  }
  return out;
})();

const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
const isHex = (c) => typeof c === 'string' && c.startsWith('#');
function initials(n) { return String(n).trim().slice(0, 1).toUpperCase() || 'C'; }
function fmt(dt) { try { return dt ? new Date(dt).toLocaleString() : '—'; } catch (_) { return '—'; } }

function Avatar({ color, iconData, name, lg, sm }) {
  const custom = isHex(color);
  const style = custom ? { background: `linear-gradient(160deg, color-mix(in srgb, ${color} 82%, #fff), ${color})` } : undefined;
  return <div className={'icon ' + (custom ? '' : (color || 'blue')) + (lg ? ' lg' : '') + (sm ? ' sm' : '')} style={style}>{iconData ? <img src={iconData} alt="" /> : initials(name)}</div>;
}
function Swatches({ value, onColor, disabled }) {
  return (
    <div className={'swatches' + (disabled ? ' disabled' : '')}>
      {COLORS.map((c) => <button key={c} disabled={disabled} className={'sw ' + c + (value === c ? ' sel' : '')} onClick={() => onColor(c)} aria-label={c} />)}
      <input type="color" disabled={disabled} className={'sw-pick' + (isHex(value) ? ' sel' : '')} title="Custom color" value={isHex(value) ? value : '#d97757'} onChange={(e) => onColor(e.target.value)} />
    </div>
  );
}
function Cropper({ src, onCancel, onDone, out = 512, frame = 240 }) {
  const F = frame;
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const [nat, setNat] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const im = new Image();
    im.onload = () => {
      imgRef.current = im;
      const w = im.naturalWidth, h = im.naturalHeight;
      const cov = F / Math.min(w, h);
      setNat({ w, h }); setZoom(1);
      setOff({ x: (F - w * cov) / 2, y: (F - h * cov) / 2 });
    };
    im.src = src;
  }, [src, F]);

  if (!nat) {
    return (
      <div className="overlay" onClick={onCancel}>
        <div className="modal crop-modal" onClick={(e) => e.stopPropagation()}><div className="crop-loading">Loading image\u2026</div></div>
      </div>
    );
  }
  const scale = (F / Math.min(nat.w, nat.h)) * zoom;
  const dispW = nat.w * scale, dispH = nat.h * scale;
  const clamp = (o) => ({ x: Math.min(0, Math.max(F - dispW, o.x)), y: Math.min(0, Math.max(F - dispH, o.y)) });
  const pos = clamp(off);
  const down = (e) => { dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }; try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {} };
  const move = (e) => { if (!dragRef.current) return; setOff(clamp({ x: dragRef.current.ox + (e.clientX - dragRef.current.sx), y: dragRef.current.oy + (e.clientY - dragRef.current.sy) })); };
  const up = () => { dragRef.current = null; };
  const confirm = () => {
    try {
      const c = document.createElement('canvas'); c.width = out; c.height = out;
      const ctx = c.getContext('2d');
      const r = out / F;
      ctx.drawImage(imgRef.current, 0, 0, nat.w, nat.h, pos.x * r, pos.y * r, dispW * r, dispH * r);
      onDone(c.toDataURL('image/png'));
    } catch (_) { onDone(src); }
  };
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h"><h3>Position icon</h3><p>Drag to move and zoom to fit. The square area becomes the icon.</p></div>
        <div className="crop-stage">
          <div className="crop-frame" style={{ width: F, height: F }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
            <img src={src} alt="" draggable={false} style={{ position: 'absolute', left: pos.x, top: pos.y, width: dispW, height: dispH, maxWidth: 'none' }} />
            <div className="crop-ring" />
          </div>
        </div>
        <div className="crop-zoom"><span>Zoom</span><input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></div>
        <div className="modal-f">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={confirm}>Use icon</button>
        </div>
      </div>
    </div>
  );
}
function Kebab() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>; }
function PhotoIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="3"/><circle cx="8.5" cy="10" r="1.7"/><path d="M4 18l5-5 4 3.5L16.5 13 20 16.5"/></svg>; }
function SpinRing() {
  return (
    <svg className="avatar-spin" viewBox="0 0 58 58" width="58" height="58" aria-hidden="true" fill="none">
      <rect className="track" x="1.6" y="1.6" width="54.8" height="54.8" rx="17" />
      <rect className="dash" x="1.6" y="1.6" width="54.8" height="54.8" rx="17" pathLength="100" />
    </svg>
  );
}

export default function App() {
  const [screen, setScreen] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState('simple');
  const [env, setEnv] = useState(null);
  const [appVersion, setAppVersion] = useState('');
  const [instances, setInstances] = useState([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const [iconPath, setIconPath] = useState(null);
  const [iconData, setIconData] = useState(null);
  const [cropSrc, setCropSrc] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editId, setEditId] = useState(null);
  const [confirmStop, setConfirmStop] = useState(null);
  const [confirmPurge, setConfirmPurge] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pickBusy, setPickBusy] = useState(false);
  const [confirmRemoveImg, setConfirmRemoveImg] = useState(false);
  const [rowMenu, setRowMenu] = useState(null);
  const [bridgeFor, setBridgeFor] = useState(null);
  const [bridgeList, setBridgeList] = useState(null);
  const [bridgeSel, setBridgeSel] = useState(() => new Set());
  const [bridgeResult, setBridgeResult] = useState(null);
  const [bridgeCollapsed, setBridgeCollapsed] = useState(() => new Set());
  const [bridgeTab, setBridgeTab] = useState('new');
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [theme, setTheme] = useState(() => lsGet('theme', 'system'));
  const [glass, setGlass] = useState(() => lsGet('glass', '0') === '1');
  const [trayGlyph, setTrayGlyph] = useState('auto');
  const [splash, setSplash] = useState(() => !(api && api.e2e));
  const [onboard, setOnboard] = useState(false);
  const [step, setStep] = useState(0);

  const refresh = useCallback(async () => { if (api) setInstances(await api.list()); }, []);
  const softRefresh = useCallback(() => { refresh(); setTimeout(refresh, 1000); }, [refresh]);
  const launchAndRefresh = useCallback((id) => api.launch(id).then(() => { refresh(); setTimeout(refresh, 1200); }), [refresh]);
  const openBridge = useCallback((target) => {
    setBridgeFor(target); setBridgeList(null); setBridgeResult(null); setBridgeSel(new Set()); setBridgeBusy(true);
    api.sessionList(target.id).then((r) => {
      setBridgeList(r);
      if (r && r.ok) {
        setBridgeSel(new Set(r.sessions.filter((x) => x.status === 'new').map((x) => x.cliSessionId)));
        const nNew = r.sessions.filter((x) => x.status === 'new').length;
        const nUpd = r.sessions.filter((x) => x.status === 'stale').length;
        setBridgeTab(nNew ? 'new' : nUpd ? 'stale' : 'current');
      }
      setBridgeBusy(false);
    });
  }, []);
  const toggleSel = (id) => setBridgeSel((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleCollapse = (proj) => setBridgeCollapsed((prev) => { const n = new Set(prev); if (n.has(proj)) n.delete(proj); else n.add(proj); return n; });
  const toggleGroup = (ids) => setBridgeSel((prev) => { const n = new Set(prev); const all = ids.every((id) => n.has(id)); for (const id of ids) { if (all) n.delete(id); else n.add(id); } return n; });
  const applyBridge = useCallback(() => {
    if (!bridgeFor) return; setBridgeBusy(true);
    api.bridgeApply(bridgeFor.id, [...bridgeSel])
      .then((r) => { setBridgeResult(r); setBridgeSel(new Set()); refresh(); return api.sessionList(bridgeFor.id); })
      .then((r) => { if (r && r.ok) setBridgeList(r); setBridgeBusy(false); })
      .catch(() => setBridgeBusy(false));
  }, [bridgeFor, bridgeSel, refresh]);
  const closeBridge = () => { setBridgeFor(null); setBridgeList(null); setBridgeSel(new Set()); setBridgeResult(null); setBridgeBusy(false); setBridgeCollapsed(new Set()); setBridgeTab('new'); };
  const openDetail = async (id) => { setDetail(await api.detail(id)); };

  useEffect(() => { if (!api) return; api.envInfo().then(setEnv); if (api.appVersion) api.appVersion().then(setAppVersion); refresh(); }, [refresh]);
  // Keep Running/Stopped live: re-poll every few seconds (only while the window
  // is visible) and whenever it regains focus, so a profile never shows a stale
  // 'Running' after its Claude window was closed outside the app.
  useEffect(() => {
    if (!api || api.e2e) return undefined;
    const tick = () => { if (!document.hidden) refresh(); };
    const id = setInterval(tick, 4000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', tick); };
  }, [refresh]);
  useEffect(() => {
    if (!api) return;
    Promise.all([
      api.getSettings ? api.getSettings() : Promise.resolve(null),
      api.appVersion ? api.appVersion() : Promise.resolve(''),
    ]).then(([s, v]) => {
      if (s && s.trayGlyph) setTrayGlyph(s.trayGlyph);
      if (v) setAppVersion(v);
      // First-run tour: shown once per app version (per build); reappears after a version change.
      if (!(api && api.e2e) && (!s || s.onboardingSeenVersion !== (v || ''))) setOnboard(true);
    });
    return api.onNav ? api.onNav((sc) => setScreen(sc === 'settings' || sc === 'about' ? sc : 'home')) : undefined;
  }, []);
  useEffect(() => { const t = setTimeout(() => setSplash(false), 1150); return () => clearTimeout(t); }, []);
  useEffect(() => { const r = document.documentElement; if (theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme); lsSet('theme', theme); }, [theme]);
  useEffect(() => { document.documentElement.classList.toggle('glass', glass); lsSet('glass', glass ? '1' : '0'); if (api && api.setGlass) api.setGlass(glass); }, [glass]);

  const pick = async () => { setPickBusy(true); try { const r = await api.pickIcon(); if (r && r.dataUrl) { setIconPath(r.path); setCropSrc(r.dataUrl); } } finally { setPickBusy(false); } };
  const resetForm = () => { setName(''); setColor('blue'); setIconPath(null); setIconData(null); setConfirmRemoveImg(false); setCropSrc(null); };
  const openAdd = () => { setEditId(null); resetForm(); setAdding(true); };
  const openEditForm = (d) => { setEditId(d.id); setName(d.name); setColor(d.color || 'blue'); setIconData(d.iconData || null); setIconPath(null); setConfirmRemoveImg(false); setDetail(null); setAdding(true); };
  const closeForm = () => { setAdding(false); setEditId(null); resetForm(); };
  const submitForm = async () => {
    if (!name.trim()) return;
    setBusy(true);
    if (editId) await api.update(editId, { name: name.trim(), color, iconData, iconPath });
    else await api.add({ name: name.trim(), mode: tab, color, iconPath, iconData });
    setBusy(false); closeForm(); refresh();
  };
  const doStop = (id) => api.stop(id).then(() => { setConfirmStop(null); setDetail(null); softRefresh(); });
  const ext = (url) => { if (api && api.openExternal) api.openExternal(url); };
  const [copied, setCopied] = useState(false);
  const copyLogs = async () => { try { const r = api.logs ? await api.logs() : null; await navigator.clipboard.writeText((r && r.text) || 'no logs'); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {} };

  const finishOnboarding = () => { setOnboard(false); setStep(0); if (api && api.setSettings) api.setSettings({ onboardingSeenVersion: appVersion || '0.1.0' }); };

  const rows = instances.filter((i) => i.mode === tab && !i.archived);
  const archivedRows = instances.filter((i) => i.archived);
  const macClass = env && env.os === 'darwin' ? ' is-mac' : '';

  if (!api) return <div className="fallback"><h1>Claude Profiles</h1><p>Run <code>pnpm dev</code> to open this inside the app.</p></div>;

  const Splash = (
    <div className={'splash' + (splash ? '' : ' hide')}>
      <img className="splash-octo" src={octoHero} alt="" />
      <div className="splash-name">Claude Profiles</div>
      <div className="splash-tag">Many logins. One Claude.</div>
    </div>
  );
  const ONB = [
    { t: 'Welcome to Claude Profiles', d: 'Run several separate Claude Desktop logins side by side, like browser profiles, but for Claude. Keep work and personal signed in at once.' },
    { t: 'Two ways to launch', d: 'Quick Launch opens Claude instantly with a separate login. Custom gives a profile its own name and Dock icon so you can tell the windows apart.' },
    { t: 'Always a click away', d: 'Claude Profiles lives in your menu bar. Click the octopus for your profiles, Preferences and more. It stays out of the way until you need it.' },
  ];
  const Onboarding = (
    <div className="onb-full">
      <div className="onb-field">
        {FIELD.map((o, i) => (
          <img key={i} className="field-octo" src={octoTan} alt="" style={{ left: o.l, top: o.t, width: o.s, height: o.s, '--rot': o.rot, '--dx': o.dx, '--dy': o.dy, '--gdur': o.gdur, '--gdel': o.gdel, '--fdur': o.fdur, '--fdel': o.fdel }} />
        ))}
      </div>
      <button className="onb-skip" onClick={finishOnboarding}>Skip</button>
      <div className="onb-inner">
        <img className="onb-octo" src={octoHero} alt="" />
        <div className="onb-t">{ONB[step].t}</div>
        <div className="onb-d">{ONB[step].d}</div>
        <div className="onb-dots">{ONB.map((_, i) => <span key={i} className={'onb-dot' + (i === step ? ' on' : '')} />)}</div>
        <div className="onb-f">
          {step > 0 ? <button className="btn ghost" onClick={() => setStep((v) => v - 1)}>Back</button> : <span />}
          {step < ONB.length - 1
            ? <button className="btn primary" onClick={() => setStep((v) => v + 1)}>Next</button>
            : <button className="btn primary" onClick={finishOnboarding}>Get started</button>}
        </div>
      </div>
    </div>
  );
  const Appearance = (
    <section className="sect">
      <h3>Appearance</h3>
      <div className="set-row"><div><div className="lbl">Theme</div><div className="hint">Overrides your system setting</div></div>
        <div className="seg">{THEMES.map(([k, l]) => <button key={k} className={theme === k ? 'on' : ''} onClick={() => setTheme(k)}>{l}</button>)}</div></div>
      <div className="set-row"><div><div className="lbl">Glass effect</div><div className="hint">Frosted, translucent surfaces</div></div>
        <button className={'toggle' + (glass ? ' on' : '')} onClick={() => setGlass((v) => !v)} aria-label="Glass effect"><span className="knob" /></button></div>
      <div className="set-row"><div><div className="lbl">Menu bar icon</div><div className="hint">Auto adapts to the menu bar; or force a colour</div></div>
        <div className="seg">{[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => <button key={k} className={trayGlyph === k ? 'on' : ''} onClick={() => { setTrayGlyph(k); if (api && api.setSettings) api.setSettings({ trayGlyph: k }); }}>{l}</button>)}</div></div>
    </section>
  );
  const Sessions = (
    <section className="sect">
      <h3>Session bridging</h3>
      <p className="about-p">Make this machine’s local Claude Code sessions show up in a profile’s sidebar. It only adds sidebar entries and backs up first, and never changes your conversations. Cloud and web chats can’t be imported.</p>
      <div className="set-row"><div><div className="lbl">Main Claude</div><div className="hint">Import local sessions into your default Claude</div></div>
        <button className="btn ghost small" onClick={() => openBridge({ id: 'main', name: 'Main Claude' })}>Import…</button></div>
      <div className="fld-note">For a specific profile, open its ⋯ menu in the list and choose “Import local sessions”.</div>
    </section>
  );
  const Archived = (
    <section className="sect">
      <h3>Archived profiles</h3>
      {archivedRows.length === 0
        ? <p className="about-p">No archived profiles. Archiving a profile from its ⋯ menu moves it here and keeps its login and data; you can restore it or delete it for good.</p>
        : archivedRows.map((it) => (
          <div className="arch-row" key={it.id}>
            <Avatar color={it.color} iconData={it.iconData} name={it.name} />
            <div className="who"><div className="nm">{it.name}</div><div className="sub">{it.mode === 'custom' ? 'Custom profile' : 'Quick-launch profile'}{it.archivedAt ? ' · archived ' + new Date(it.archivedAt).toLocaleDateString() : ''}</div></div>
            <button className="btn ghost small" onClick={() => api.restore(it.id).then(refresh)}>Restore</button>
            <button className="btn danger small" onClick={() => setConfirmPurge(it)}>Delete permanently</button>
          </div>
        ))}
    </section>
  );
  const About = (
    <section className="sect">
      <div className="about-hero"><img className="about-icon" src={octoHero} alt="Claude Profiles" />
        <div><div className="about-name">Claude Profiles</div><div className="about-ver">Version {appVersion || '0.1.0'} · MIT licensed</div></div></div>
      <p className="about-p">Run several separate <b>Claude Desktop logins</b> side by side on one machine, like browser profiles, but for Claude. Keep work and personal signed in at once, each with its own history and, if you like, its own name and icon.</p>
      <p className="about-p">It works on your <b>already-installed</b> Claude. It never bundles Anthropic’s app, makes no network calls of its own, and never touches your conversations.</p>
      <div className="about-tags"><span className="chiptag">Open source</span><span className="chiptag">macOS · Windows · Linux</span><span className="chiptag">No telemetry</span></div>
      <div className="about-links"><button className="btn primary" onClick={() => ext(REPO)}>View on GitHub</button><button className="btn ghost" onClick={() => ext(LINKEDIN)}>Built by Shahrukh Khan</button><button className="btn ghost" onClick={copyLogs}>{copied ? 'Copied ✓' : 'Copy diagnostics'}</button></div>
    </section>
  );

  if (screen === 'settings' || screen === 'about' || screen === 'archive') {
    return (
      <div className={'app' + macClass}>
        {Splash}
        {onboard && Onboarding}
        <header className="topbar">
          <button className="icon-btn back" onClick={() => setScreen('home')} title="Back">‹</button>
          <div className="pagetitle">{screen === 'settings' ? 'Settings' : screen === 'archive' ? 'Archived' : 'About'}</div><div className="spacer" />
        </header>
        <main className="page wide">{screen === 'settings' ? <>{Appearance}{Sessions}</> : screen === 'archive' ? Archived : About}</main>
        <footer className="statusbar"><span className="cd" />{env ? <>Claude {env.version || '—'} · {env.claudeApp ? 'detected' : 'not found'}</> : '—'}<button className="credit" onClick={() => ext(LINKEDIN)} title="Shahrukh Khan on LinkedIn">Built by <b>Shahrukh Khan</b></button></footer>
      </div>
    );
  }

  return (
    <div className={'app' + macClass}>
      {Splash}
      {onboard && Onboarding}
      <header className="topbar">
        <div className="tabs">{TABS.map((t) => <button key={t.key} className={'tab' + (tab === t.key ? ' active' : '')} onClick={() => { setTab(t.key); setAdding(false); }}>{t.label}</button>)}</div>
        <div className="spacer" />
        <button className="btn primary" onClick={openAdd}>+ Add</button>
        <div className="menuwrap">
          <button className="icon-btn" title="Menu" onClick={() => setMenuOpen((v) => !v)}><Kebab /></button>
          {menuOpen && (<>
            <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
            <div className="menu">
              <button onClick={() => { setScreen('archive'); setMenuOpen(false); }}>Archived</button>
              <button onClick={() => { setScreen('settings'); setMenuOpen(false); }}>Settings</button>
              <button onClick={() => { setScreen('about'); setMenuOpen(false); }}>About</button>
            </div>
          </>)}
        </div>
        <div className="brand"><img className="octo-mark" src={octoMark} alt="" /><span>Claude Profiles</span></div>
      </header>

      {adding && (
        <div className="overlay" onClick={closeForm}>
          <div className="modal add-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><h3>{editId ? 'Edit profile' : 'New profile'}</h3><p>{editId ? 'Update its name, colour or image.' : (tab === 'custom' ? 'A custom profile with its own name and Dock icon.' : 'A quick-launch profile.')}</p></div>
            <div className="modal-b">
              <div className="preview-row">
                <div className="avatar-wrap" onClick={() => { if (!pickBusy) pick(); }} title="Add an image">
                  {iconData
                    ? <Avatar color={color} iconData={iconData} name={name} lg />
                    : (name.trim() ? <Avatar color={color} name={name} lg /> : <div className="icon lg placeholder"><PhotoIcon /></div>)}
                  {pickBusy && <SpinRing />}
                </div>
                <div className="preview-actions">
                  {confirmRemoveImg ? (
                    <div className="rm-confirm">
                      <span>Remove this image?</span>
                      <button className="btn ghost small" onClick={() => setConfirmRemoveImg(false)}>Keep</button>
                      <button className="btn danger small" onClick={() => { setIconData(null); setIconPath(null); setConfirmRemoveImg(false); }}>Remove</button>
                    </div>
                  ) : (
                    <>
                      <button className="btn ghost small" disabled={pickBusy} onClick={pick}>{pickBusy ? 'Adding…' : (iconData ? 'Change image' : 'Choose image')}</button>
                      {iconData && !pickBusy && <button className="btn ghost small" onClick={() => setConfirmRemoveImg(true)}>Remove</button>}
                      <div className="preview-hint">{pickBusy ? 'Processing image…' : (iconData ? 'This image will be its icon.' : 'Add a photo, or pick a colour below.')}</div>
                    </>
                  )}
                </div>
              </div>
              <label className="fld"><span>Name</span>
                <input autoFocus placeholder="e.g. Work" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitForm()} />
              </label>
              <div className="fld"><span>Colour{iconData ? <em className="fld-note"> (remove the image to choose a colour)</em> : null}</span>
                <Swatches value={color} disabled={!!iconData} onColor={(c) => setColor(c)} />
              </div>
            </div>
            <div className="modal-f">
              <button className="btn ghost" onClick={closeForm}>Cancel</button>
              <button className="btn primary" disabled={busy || !name.trim()} onClick={submitForm}>{busy ? 'Saving…' : (editId ? 'Save changes' : 'Create profile')}</button>
            </div>
          </div>
        </div>
      )}

      <main className="list">
        {rows.length === 0 && <div className="empty"><p>No {tab === 'simple' ? 'quick-launch' : 'custom'} profiles yet.</p><button className="btn primary" onClick={openAdd}>+ Add your first</button></div>}
        {rows.map((it) => (
          <div className={'card' + (it.running ? ' run' : '')} key={it.id} onClick={() => openDetail(it.id)}>
            <Avatar color={it.color} iconData={it.iconData} name={it.name} />
            <div className="who">
              <div className="nm">{it.name}{it.updateAvailable && <span className="badge-upd">update</span>}{it.buildError && <span className="badge-err">error</span>}</div>
              <div className="sub">{it.lastLaunchedAt ? 'Last opened ' + new Date(it.lastLaunchedAt).toLocaleDateString() : (it.mode === 'custom' ? 'Custom profile' : 'Quick-launch profile')}</div>
            </div>
            <div className={'status' + (it.running ? ' on' : '')}><span className="dot" />{it.running ? 'Running' : 'Stopped'}</div>
            <div className="actions" onClick={(e) => e.stopPropagation()}>
              {it.updateAvailable && <button className="btn small amber" onClick={() => api.rebuild(it.id).then(refresh)}>Update</button>}
              {it.running ? (<><button className="btn small ghost" onClick={() => api.launch(it.id).then(refresh)}>Front</button><button className="btn small danger" onClick={() => setConfirmStop(it)}>Stop</button></>)
                : <button className="btn small primary" onClick={() => launchAndRefresh(it.id)}>Launch</button>}
            </div>
            <button className="kebab" title="More actions" onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setRowMenu(rowMenu && rowMenu.id === it.id ? null : { id: it.id, x: r.right, y: r.bottom }); }}>
              <span /><span /><span />
            </button>
          </div>
        ))}
      </main>

      <footer className="statusbar"><span className="cd" />{env ? <>Claude {env.version || '—'} · {env.claudeApp ? 'detected' : 'not found'}</> : 'Loading…'}<button className="credit" onClick={() => ext(LINKEDIN)} title="Shahrukh Khan on LinkedIn">Built by <b>Shahrukh Khan</b></button></footer>

      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="sheet2" onClick={(e) => e.stopPropagation()}>
            <div className="d-top">
              <Avatar color={detail.color} iconData={detail.iconData} name={detail.name} lg />
              <div><div className="d-name">{detail.name}</div>
                <div className={'status' + (detail.running ? ' on' : '')} style={{ marginTop: 6 }}><span className="dot" />{detail.running ? ('Running' + (detail.uptime ? ' · ' + detail.uptime : '')) : 'Stopped'}</div></div>
              <div className="d-top-actions">
                <button className="btn ghost small" onClick={() => openEditForm(detail)}>Edit</button>
                <button className="x" onClick={() => setDetail(null)}>✕</button>
              </div>
            </div>
            {(
              <>
                {detail.buildError && <div className="err-banner">Build problem: {detail.buildError}</div>}
                <div className="mgrid">
                  <div className="kv"><span className="k">Created</span><span className="v">{fmt(detail.createdAt)}</span></div>
                  <div className="kv"><span className="k">Last launched</span><span className="v">{fmt(detail.lastLaunchedAt)}</span></div>
                  <div className="kv"><span className="k">Uptime</span><span className="v">{detail.uptime || '—'}</span></div>
                  <div className="kv"><span className="k">Memory</span><span className="v">{detail.memoryMB ? detail.memoryMB + ' MB' : '—'}</span></div>
                  <div className="kv"><span className="k">Claude version</span><span className="v">{detail.claudeVersion || (env && env.version) || '—'}</span></div>
                  <div className="kv"><span className="k">Launches</span><span className="v">{detail.launches || 0}</span></div>
                  <div className="kv full"><span className="k">Data folder</span><span className="v mono">{detail.dataDir}</span></div>
                </div>
                <div className="d-actions">
                  {detail.running ? <button className="btn primary" onClick={() => api.launch(detail.id)}>Bring to front</button> : <button className="btn primary" onClick={() => { launchAndRefresh(detail.id); setDetail(null); }}>Launch</button>}
                  {detail.running && <button className="btn danger" onClick={() => setConfirmStop(detail)}>Stop</button>}
                  {detail.mode === 'custom' && <button className={'btn ' + (detail.updateAvailable ? 'amber' : 'ghost')} onClick={() => api.rebuild(detail.id).then(() => { setDetail(null); refresh(); })}>Rebuild</button>}
                  <button className="btn ghost" onClick={() => { api.archive(detail.id).then(() => { setDetail(null); refresh(); }); }}>Archive</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {rowMenu && (() => {
        const it = rows.find((r) => r.id === rowMenu.id);
        if (!it) return null;
        const close = () => setRowMenu(null);
        return (
          <>
            <div className="menu-scrim" onClick={close} />
            <div className="rowmenu" style={{ top: rowMenu.y + 6, left: rowMenu.x }}>
              <button onClick={() => { close(); openEditForm(it); }}>Edit</button>
              <button onClick={() => { close(); openBridge({ id: it.id, name: it.name }); }}>Import local sessions</button>
              <button onClick={() => { close(); api.archive(it.id).then(refresh); }}>Archive</button>
            </div>
          </>
        );
      })()}
      {bridgeFor && (
        <div className="overlay" onClick={closeBridge}>
          <div className="modal bwide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><h3>Import sessions into “{bridgeFor.name}”</h3>
              <p>Pick which of this machine’s local Claude Code sessions to show in this profile. It only adds sidebar entries and backs up first, and never changes your conversations. The profile must be fully quit.</p></div>
            <div className="bridge-body">
              {bridgeBusy && !bridgeList && (
                <div className="sesslist">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div className="sess skel" key={i}>
                      <span className="sk-box" />
                      <span className="sess-main"><span className="sk-line w1" /><span className="sk-line w2" /></span>
                    </div>
                  ))}
                </div>
              )}
              {bridgeList && !bridgeList.ok && <div className="bridge-msg err">{bridgeList.error}</div>}
              {bridgeList && bridgeList.ok && bridgeList.running && <div className="bridge-msg err">Quit “{bridgeFor.name}” first, then reopen this.</div>}
              {bridgeList && bridgeList.ok && !bridgeList.running && (() => {
                const all = bridgeList.sessions;
                const nNew = all.filter((x) => x.status === 'new').length;
                const nUpd = all.filter((x) => x.status === 'stale').length;
                const nCur = all.filter((x) => x.status === 'current').length;
                const inTab = all.filter((x) => x.status === bridgeTab);
                const groups = {};
                for (const x of inTab) (groups[x.project] = groups[x.project] || []).push(x);
                const emptyMsg = bridgeTab === 'new' ? 'No new sessions to import.' : bridgeTab === 'stale' ? 'No updates. Everything imported here is up to date.' : 'Nothing imported into this profile yet.';
                return (
                  <>
                    {bridgeResult && <div className="bridge-msg ok"><b>{bridgeResult.written || 0}</b> imported{bridgeResult.refreshed ? ', ' + bridgeResult.refreshed + ' updated' : ''}. Fully quit and reopen “{bridgeFor.name}” to see the changes.</div>}
                    <div className="sess-legend">Conversations are a single shared file, so their content stays current across profiles. This only sets what “{bridgeFor.name}” shows in its sidebar.</div>
                    <div className="bridge-tabs">
                      {[['new', 'New', nNew], ['stale', 'Updates', nUpd], ['current', 'Up to date', nCur]].map(([k, l, c]) => (
                        <button key={k} type="button" className={'btab' + (bridgeTab === k ? ' on' : '')} onClick={() => setBridgeTab(k)}>{l} <span className="btab-n">{c}</span></button>
                      ))}
                    </div>
                    {bridgeTab !== 'current' && (
                      <div className="bridge-tools">
                        <button className="linklike" onClick={() => setBridgeSel((prev) => { const n = new Set(prev); inTab.forEach((x) => n.add(x.cliSessionId)); return n; })}>Select all in view</button>
                        <button className="linklike" onClick={() => setBridgeSel(new Set())}>Clear selection</button>
                        <span className="bridge-count">{bridgeSel.size} selected</span>
                      </div>
                    )}
                    {inTab.length === 0
                      ? (
                        <div className="sess-empty">
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7l2-3h14l2 3" /><path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7" /><path d="M8 12h8" /></svg>
                          <div>{emptyMsg}</div>
                        </div>
                      )
                      : (
                        <div className="sesslist">
                          {Object.keys(groups).sort().map((proj) => {
                            const list = groups[proj];
                            const actionable = list.filter((x) => x.status !== 'current').map((x) => x.cliSessionId);
                            const allSel = actionable.length > 0 && actionable.every((id) => bridgeSel.has(id));
                            const collapsed = bridgeCollapsed.has(proj);
                            return (
                              <div className="sessgroup" key={proj}>
                                <div className="sessgroup-h">
                                  <input type="checkbox" disabled={actionable.length === 0} checked={allSel} onChange={() => toggleGroup(actionable)} />
                                  <button type="button" className="sessgroup-name" onClick={() => toggleCollapse(proj)} title={proj}>
                                    <span className="caret">{collapsed ? '▸' : '▾'}</span><span className="sessgroup-label">{proj}</span>
                                  </button>
                                  <span className="sessgroup-count">{list.length}</span>
                                </div>
                                {!collapsed && list.map((x) => (
                                  <label key={x.cliSessionId} className={'sess nested' + (x.status === 'current' ? ' done' : '')}>
                                    <input type="checkbox" disabled={x.status === 'current'} checked={bridgeSel.has(x.cliSessionId)} onChange={() => toggleSel(x.cliSessionId)} />
                                    <span className="sess-main"><span className="sess-title" title={x.title}>{x.title}</span><span className="sess-meta">{x.lastActivityAt ? new Date(x.lastActivityAt).toLocaleDateString() : ''}</span></span>
                                  </label>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                  </>
                );
              })()}
            </div>
            <div className="modal-f">
              <button className="btn ghost" onClick={closeBridge}>{bridgeResult ? 'Close' : 'Cancel'}</button>
              {bridgeList && bridgeList.ok && !bridgeList.running && (() => {
                const st = Object.fromEntries(bridgeList.sessions.map((x) => [x.cliSessionId, x.status]));
                const selNew = [...bridgeSel].filter((id) => st[id] === 'new').length;
                const selUpd = [...bridgeSel].filter((id) => st[id] === 'stale').length;
                const n = selNew + selUpd;
                const label = selUpd === 0 ? `Import ${n}` : selNew === 0 ? `Update ${n}` : `Sync ${n}`;
                return <button className="btn primary" disabled={bridgeBusy || n === 0} onClick={applyBridge}>{bridgeBusy ? 'Working…' : label}</button>;
              })()}
            </div>
          </div>
        </div>
      )}
      {cropSrc && <Cropper src={cropSrc} onCancel={() => setCropSrc(null)} onDone={(d) => { setIconData(d); setCropSrc(null); }} />}
      {confirmPurge && (
        <div className="overlay" onClick={() => setConfirmPurge(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><h3>Delete “{confirmPurge.name}” permanently?</h3>
              <p>This erases its login, history and data folder{confirmPurge.mode === 'custom' ? ', and removes its app clone' : ''}. This can’t be undone.</p></div>
            <div className="modal-f">
              <button className="btn ghost" onClick={() => setConfirmPurge(null)}>Cancel</button>
              <button className="btn danger" onClick={() => { const id = confirmPurge.id; api.remove(id, false).then(() => { setConfirmPurge(null); refresh(); }); }}>Delete permanently</button>
            </div>
          </div>
        </div>
      )}

      {confirmStop && (
        <div className="overlay" onClick={() => setConfirmStop(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><h3>Stop “{confirmStop.name}”?</h3><p>This quits the running window. The profile, its login and history stay, and you can relaunch it anytime.</p></div>
            <div className="modal-f"><button className="btn ghost" onClick={() => setConfirmStop(null)}>Cancel</button><button className="btn danger" onClick={() => doStop(confirmStop.id)}>Stop</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
