import React, { useEffect, useState, useCallback } from 'react';
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
  const [detail, setDetail] = useState(null);
  const [editId, setEditId] = useState(null);
  const [confirmStop, setConfirmStop] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [eraseData, setEraseData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pickBusy, setPickBusy] = useState(false);
  const [confirmRemoveImg, setConfirmRemoveImg] = useState(false);
  const [rowMenu, setRowMenu] = useState(null);
  const [theme, setTheme] = useState(() => lsGet('theme', 'system'));
  const [glass, setGlass] = useState(() => lsGet('glass', '0') === '1');
  const [trayGlyph, setTrayGlyph] = useState('auto');
  const [splash, setSplash] = useState(() => !(api && api.e2e));
  const [onboard, setOnboard] = useState(false);
  const [step, setStep] = useState(0);

  const refresh = useCallback(async () => { if (api) setInstances(await api.list()); }, []);
  const softRefresh = useCallback(() => { refresh(); setTimeout(refresh, 1000); }, [refresh]);
  const launchAndRefresh = useCallback((id) => api.launch(id).then(() => { refresh(); setTimeout(refresh, 1200); }), [refresh]);
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

  const pick = async () => { setPickBusy(true); try { const r = await api.pickIcon(); if (r && r.dataUrl) { setIconPath(r.path); setIconData(r.dataUrl); } } finally { setPickBusy(false); } };
  const resetForm = () => { setName(''); setColor('blue'); setIconPath(null); setIconData(null); setConfirmRemoveImg(false); };
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

  const rows = instances.filter((i) => i.mode === tab);
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

  if (screen === 'settings' || screen === 'about') {
    return (
      <div className={'app' + macClass}>
        {Splash}
        {onboard && Onboarding}
        <header className="topbar">
          <button className="icon-btn back" onClick={() => setScreen('home')} title="Back">‹</button>
          <div className="pagetitle">{screen === 'settings' ? 'Settings' : 'About'}</div><div className="spacer" />
        </header>
        <main className="page wide">{screen === 'settings' ? Appearance : About}</main>
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
                  <button className="btn danger" onClick={() => setConfirmRemove(detail)}>Remove</button>
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
              <button onClick={() => { close(); setEraseData(false); setConfirmRemove(it); }}>Remove, keep data</button>
              <button className="danger" onClick={() => { close(); setEraseData(true); setConfirmRemove(it); }}>Delete everything</button>
            </div>
          </>
        );
      })()}
      {confirmRemove && (
        <div className="overlay" onClick={() => { setConfirmRemove(null); setEraseData(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><h3>Remove “{confirmRemove.name}”?</h3>
              <p>{confirmRemove.mode === 'custom'
                ? 'This removes it from the list and deletes its app clone and Dock icon.'
                : 'This removes it from the list.'} Its login and history are kept by default, so creating a profile named “{confirmRemove.name}” again later restores this session.</p></div>
            <label className="chk"><input type="checkbox" checked={eraseData} onChange={(e) => setEraseData(e.target.checked)} /><span>Also permanently delete its login and history (can’t be undone)</span></label>
            <div className="modal-f">
              <button className="btn ghost" onClick={() => { setConfirmRemove(null); setEraseData(false); }}>Cancel</button>
              <button className={'btn ' + (eraseData ? 'danger' : 'primary')} onClick={() => { const id = confirmRemove.id; api.remove(id, !eraseData).then(() => { setConfirmRemove(null); setEraseData(false); setDetail(null); refresh(); }); }}>{eraseData ? 'Erase everything' : 'Remove, keep data'}</button>
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
