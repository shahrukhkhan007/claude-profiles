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
// Friendly project label: the session's working folder name (falls back to the
// encoded ~/.claude/projects dir name). The full path stays in the tooltip.
function projLabel(list, key) {
  const cwd = (list.find((x) => x.cwd) || {}).cwd;
  if (!cwd) return key;
  const parts = String(cwd).split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join('/') || key;
}
const SESS_SORTS = [['recent', 'Most recent'], ['oldest', 'Oldest'], ['name', 'Name A–Z'], ['project', 'Project']];
function fmt(dt) { try { return dt ? new Date(dt).toLocaleString() : '—'; } catch (_) { return '—'; } }

function Avatar({ color, iconData, name, lg, sm }) {
  const custom = isHex(color);
  const style = custom ? { background: `linear-gradient(160deg, color-mix(in srgb, ${color} 82%, #fff), ${color})` } : undefined;
  // With an image, use a neutral backdrop so transparent edges don't show the colour.
  if (iconData) return <div className={'icon has-img' + (lg ? ' lg' : '') + (sm ? ' sm' : '')}><img src={iconData} alt="" /></div>;
  return <div className={'icon ' + (custom ? '' : (color || 'blue')) + (lg ? ' lg' : '') + (sm ? ' sm' : '')} style={style}>{initials(name)}</div>;
}
function Swatches({ value, onColor, disabled }) {
  return (
    <div className={'swatches' + (disabled ? ' disabled' : '')}>
      {COLORS.map((c) => <button key={c} disabled={disabled} className={'sw ' + c + (value === c ? ' sel' : '')} onClick={() => onColor(c)} aria-label={c} />)}
      <input type="color" disabled={disabled} className={'sw-pick' + (isHex(value) ? ' sel' : '')} title="Custom color" value={isHex(value) ? value : '#d97757'} onChange={(e) => onColor(e.target.value)} />
    </div>
  );
}
// macOS app-icon template: the artwork is a rounded square ("squircle") of
// 824px centred on a 1024px canvas (100px transparent margin), with a soft
// drop shadow. Following it makes a Custom profile's Dock icon the same size
// and shape as every other app instead of a full-bleed square.
const DOCK = { canvas: 1024, size: 824, radius: 185 };
function squirclePath(ctx, x, y, s, r) {
  // Continuous-corner rounded square (closer to Apple's shape than arcTo circles).
  const k = 0.552 * 1.28; // longer handles → smoother "squircle" shoulders
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + s - r, y);
  ctx.bezierCurveTo(x + s - r + r * k, y, x + s, y + r - r * k, x + s, y + r);
  ctx.lineTo(x + s, y + s - r);
  ctx.bezierCurveTo(x + s, y + s - r + r * k, x + s - r + r * k, y + s, x + s - r, y + s);
  ctx.lineTo(x + r, y + s);
  ctx.bezierCurveTo(x + r - r * k, y + s, x, y + s - r + r * k, x, y + s - r);
  ctx.lineTo(x, y + r);
  ctx.bezierCurveTo(x, y + r - r * k, x + r - r * k, y, x + r, y);
  ctx.closePath();
}
function makeDockIcon(src) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      try {
        const { canvas: C, size: S, radius: R } = DOCK;
        const c = document.createElement('canvas'); c.width = C; c.height = C;
        const ctx = c.getContext('2d');
        const o = (C - S) / 2;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 12;
        squirclePath(ctx, o, o, S, R); ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.restore();
        ctx.save();
        squirclePath(ctx, o, o, S, R); ctx.clip();
        const side = Math.min(im.naturalWidth, im.naturalHeight);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(im, (im.naturalWidth - side) / 2, (im.naturalHeight - side) / 2, side, side, o, o, S, S);
        ctx.restore();
        resolve(c.toDataURL('image/png'));
      } catch (_) { resolve(null); }
    };
    im.onerror = () => resolve(null);
    im.src = src;
  });
}
function Cropper({ src, onCancel, onDone, out = 1024, frame = 240 }) {
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
      ctx.imageSmoothingQuality = 'high';
      const r = out / F;
      ctx.drawImage(imgRef.current, 0, 0, nat.w, nat.h, pos.x * r, pos.y * r, dispW * r, dispH * r);
      onDone(c.toDataURL('image/png'));
    } catch (_) { onDone(src); }
  };
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal crop-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h"><h3>Position icon</h3><p>Drag to move and zoom to fit. The highlighted area is exactly what your icon will show.</p></div>
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
function Chevron({ open }) { return <svg className={'chev' + (open ? ' open' : '')} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>; }
function EyeOff() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>; }
// Order a project's sessions as a tree: each parent followed by the sessions
// started from it (Claude's "sub-sessions"), indented one level per depth.
function asTree(list) {
  const ids = new Set(list.map((x) => x.cliSessionId));
  const kids = {};
  const roots = [];
  for (const x of list) {
    if (x.parentCli && ids.has(x.parentCli) && x.parentCli !== x.cliSessionId) (kids[x.parentCli] = kids[x.parentCli] || []).push(x);
    else roots.push(x);
  }
  const out = [];
  const walk = (x, depth) => { out.push({ x, depth }); for (const k of kids[x.cliSessionId] || []) if (depth < 6) walk(k, depth + 1); };
  roots.forEach((r) => walk(r, 0));
  return out;
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
  const [editMode, setEditMode] = useState(null);
  const [iconDirty, setIconDirty] = useState(false);
  const [dockPreview, setDockPreview] = useState(null);
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
  const [bridgeQuery, setBridgeQuery] = useState('');
  const [bridgeSort, setBridgeSort] = useState('recent');
  const [hiddenProjects, setHiddenProjects] = useState(() => new Set());
  const [theme, setTheme] = useState(() => lsGet('theme', 'system'));
  const [glass, setGlass] = useState(() => lsGet('glass', '0') === '1');
  const [trayGlyph, setTrayGlyph] = useState('auto');
  const [splash, setSplash] = useState(() => !(api && api.e2e));
  const [onboard, setOnboard] = useState(false);
  // Self-update: info from GitHub Releases + where we are in check → download → install.
  const [upd, setUpd] = useState({ phase: 'idle', info: null, progress: 0, error: null, dismissed: false });
  const [autoUpd, setAutoUpd] = useState(true);
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
  const toggleSel = (id) => setBridgeSel((prev) => {
    const n = new Set(prev);
    if (n.has(id)) { n.delete(id); return n; }
    n.add(id);
    // A sub-session only nests in Claude if its parent is imported too.
    const byId = Object.fromEntries(((bridgeList && bridgeList.sessions) || []).map((x) => [x.cliSessionId, x]));
    let p = byId[id] && byId[id].parentCli;
    for (let i = 0; p && byId[p] && i < 8; i++) { if (byId[p].status !== 'current') n.add(p); p = byId[p].parentCli; }
    return n;
  });
  const toggleCollapse = (proj) => setBridgeCollapsed((prev) => { const n = new Set(prev); if (n.has(proj)) n.delete(proj); else n.add(proj); return n; });
  const toggleGroup = (ids) => setBridgeSel((prev) => { const n = new Set(prev); const all = ids.every((id) => n.has(id)); for (const id of ids) { if (all) n.delete(id); else n.add(id); } return n; });
  const applyBridge = useCallback(() => {
    if (!bridgeFor) return; setBridgeBusy(true);
    api.bridgeApply(bridgeFor.id, [...bridgeSel])
      .then((r) => { setBridgeResult(r); setBridgeSel(new Set()); refresh(); return api.sessionList(bridgeFor.id); })
      .then((r) => { if (r && r.ok) setBridgeList(r); setBridgeBusy(false); })
      .catch(() => setBridgeBusy(false));
  }, [bridgeFor, bridgeSel, refresh]);
  const saveHidden = (next) => { setHiddenProjects(next); if (api && api.setSettings) api.setSettings({ hiddenProjects: [...next] }); };
  const hideProject = (proj, ids) => {
    const n = new Set(hiddenProjects); n.add(proj); saveHidden(n);
    setBridgeSel((prev) => { const m = new Set(prev); for (const id of ids) m.delete(id); return m; });
  };
  const showProject = (proj) => { const n = new Set(hiddenProjects); n.delete(proj); saveHidden(n); };
  const changeSort = (v) => { setBridgeSort(v); if (api && api.setSettings) api.setSettings({ sessionSort: v }); };
  const closeBridge = () => { setBridgeQuery(''); setBridgeFor(null); setBridgeList(null); setBridgeSel(new Set()); setBridgeResult(null); setBridgeBusy(false); setBridgeCollapsed(new Set()); setBridgeTab('new'); };
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
      if (s && Array.isArray(s.hiddenProjects)) setHiddenProjects(new Set(s.hiddenProjects));
      if (s && s.sessionSort) setBridgeSort(s.sessionSort);
      if (s && s.autoUpdateCheck === false) setAutoUpd(false);
      if (v) setAppVersion(v);
      // First-run tour: shown once per app version (per build); reappears after a version change.
      if (!(api && api.e2e) && (!s || s.onboardingSeenVersion !== (v || ''))) setOnboard(true);
    });
    return api.onNav ? api.onNav((sc) => setScreen(sc === 'settings' || sc === 'about' ? sc : 'home')) : undefined;
  }, []);
  useEffect(() => {
    if (!api || !api.onUpdate) return undefined;
    api.updateState().then((st) => {
      if (!st) return;
      setUpd((u) => ({ ...u, info: st.info || u.info, phase: st.downloading ? 'downloading' : st.downloaded ? 'ready' : u.phase, progress: st.progress || 0 }));
    });
    return api.onUpdate((ev) => {
      if (ev.type === 'available') setUpd((u) => ({ ...u, info: ev.info }));
      if (ev.type === 'progress') setUpd((u) => ({ ...u, phase: 'downloading', progress: ev.progress }));
    });
  }, []);
  useEffect(() => { const t = setTimeout(() => setSplash(false), 1150); return () => clearTimeout(t); }, []);
  useEffect(() => { const r = document.documentElement; if (theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme); lsSet('theme', theme); }, [theme]);
  useEffect(() => { document.documentElement.classList.toggle('glass', glass); lsSet('glass', glass ? '1' : '0'); if (api && api.setGlass) api.setGlass(glass); }, [glass]);

  const pick = async () => { setPickBusy(true); try { const r = await api.pickIcon(); if (r && r.dataUrl) { setIconPath(r.path); setCropSrc(r.dataUrl); } } finally { setPickBusy(false); } };
  const resetForm = () => { setName(''); setColor('blue'); setIconPath(null); setIconData(null); setConfirmRemoveImg(false); setCropSrc(null); setIconDirty(false); setEditMode(null); };
  const openAdd = () => { setEditId(null); resetForm(); setAdding(true); };
  const openEditForm = (d) => { setEditId(d.id); setEditMode(d.mode); setIconDirty(false); setName(d.name); setColor(d.color || 'blue'); setIconData(d.iconData || null); setIconPath(null); setConfirmRemoveImg(false); setDetail(null); setAdding(true); };
  const closeForm = () => { setAdding(false); setEditId(null); resetForm(); };
  const formIsCustom = editId ? editMode === 'custom' : tab === 'custom';
  const submitForm = async () => {
    if (!name.trim()) return;
    setBusy(true);
    // Custom profiles get a macOS-shaped Dock icon made from the cropped image.
    const dockIconData = formIsCustom && iconData && (iconDirty || !editId) ? await makeDockIcon(iconData) : null;
    if (editId) {
      const patch = { name: name.trim(), color };
      if (iconDirty) Object.assign(patch, { iconData, iconPath }, dockIconData ? { dockIconData } : {});
      await api.update(editId, patch);
    } else await api.add({ name: name.trim(), mode: tab, color, iconPath, iconData, dockIconData });
    setBusy(false); closeForm(); refresh();
  };
  // Update a Custom profile's app: older ones also get the new macOS-shaped Dock icon.
  const fixClone = async (it) => {
    if (it.iconData && !it.dockIconPath) {
      const d = await makeDockIcon(it.iconData);
      if (d) await api.update(it.id, { dockIconData: d }); // re-applies icon + re-signs
      if (!env || !env.version || it.claudeVersionAtBuild === env.version) { refresh(); return; }
    }
    await api.rebuild(it.id); refresh();
  };
  const doStop = (id) => api.stop(id).then(() => { setConfirmStop(null); setDetail(null); softRefresh(); });
  const ext = (url) => { if (api && api.openExternal) api.openExternal(url); };
  const [copied, setCopied] = useState(false);
  const copyLogs = async () => { try { const r = api.logs ? await api.logs() : null; await navigator.clipboard.writeText((r && r.text) || 'no logs'); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {} };

  const checkUpdate = async () => {
    setUpd((u) => ({ ...u, phase: 'checking', error: null }));
    const info = await api.checkUpdate();
    setUpd((u) => ({ ...u, info, dismissed: false, phase: info && info.ok ? 'idle' : 'error', error: info && !info.ok ? info.error : null }));
    return info;
  };
  // Quick check from the ⋮ menu: result shows as a short toast (or the update banner).
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (msg, ms = 3200) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), ms); };
  const menuUpdate = async () => {
    setMenuOpen(false);
    if (upd.info && upd.info.ok && upd.info.newer) {
      setUpd((u) => ({ ...u, dismissed: false }));
      if (upd.phase === 'ready') installUpdate();
      else if (upd.phase !== 'downloading' && upd.phase !== 'installing' && !(upd.info && upd.info.blocked)) startUpdate();
      return;
    }
    showToast('Checking for updates…', 20000);
    const info = await checkUpdate();
    if (!info || !info.ok) showToast('Couldn’t check for updates' + (info && info.error ? ': ' + info.error : '.'), 5000);
    else if (info.newer) showToast(`Version ${info.latest} is available.`);
    else showToast(`You’re up to date (v${info.current || appVersion}).`);
  };
  const startUpdate = async () => {
    setUpd((u) => ({ ...u, phase: 'downloading', progress: 0, error: null }));
    const r = await api.downloadUpdate();
    if (!r || !r.ok) { setUpd((u) => ({ ...u, phase: 'error', error: (r && r.error) || 'Download failed.' })); return; }
    setUpd((u) => ({ ...u, phase: 'ready', progress: 1 }));
  };
  const installUpdate = async () => {
    setUpd((u) => ({ ...u, phase: 'installing', error: null }));
    const r = await api.installUpdate();
    if (!r || !r.ok) setUpd((u) => ({ ...u, phase: 'error', error: (r && r.error) || 'Could not install.' }));
    else if (r.mode === 'opened') setUpd((u) => ({ ...u, phase: 'opened' }));
  };
  const updAvailable = !!(upd.info && upd.info.ok && upd.info.newer);
  const UpdateAction = () => {
    if (upd.phase === 'downloading') return <div className="upd-prog"><div className="upd-bar"><span style={{ width: Math.round(upd.progress * 100) + '%' }} /></div><span>{Math.round(upd.progress * 100)}%</span></div>;
    if (upd.phase === 'ready') return <button className="btn primary small" onClick={installUpdate}>Restart &amp; install</button>;
    if (upd.phase === 'installing') return <span className="upd-note">Installing… the app will reopen.</span>;
    if (upd.phase === 'opened') return <span className="upd-note">Installer opened. Finish it there.</span>;
    if (upd.info && upd.info.blocked) return <span className="upd-note">{upd.info.blocked}</span>;
    return <button className="btn primary small" onClick={startUpdate}>Update now</button>;
  };
  useEffect(() => {
    let live = true;
    if (adding && formIsCustom && iconData) makeDockIcon(iconData).then((d) => { if (live) setDockPreview(d); });
    else setDockPreview(null);
    return () => { live = false; };
  }, [adding, formIsCustom, iconData]);
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
  const Updates = (
    <section className="sect">
      <h3>Updates</h3>
      <div className="set-row"><div><div className="lbl">Check for updates automatically</div><div className="hint">Asks GitHub Releases for a newer version. Nothing else is sent.</div></div>
        <button className={'toggle' + (autoUpd ? ' on' : '')} onClick={() => { const v = !autoUpd; setAutoUpd(v); if (api && api.setSettings) api.setSettings({ autoUpdateCheck: v }); }} aria-label="Check for updates automatically"><span className="knob" /></button></div>
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
      <p className="about-p">It works on your <b>already-installed</b> Claude. It never bundles Anthropic’s app, never touches your conversations, and its only network call is checking GitHub for a newer version of itself.</p>
      <div className="upd-box">
        <div className="upd-txt">
          {upd.phase === 'checking' ? 'Checking for updates…'
            : upd.phase === 'error' ? <span className="upd-err">{upd.error}</span>
              : updAvailable ? <>Version <b>{upd.info.latest}</b> is available.</>
                : upd.info && upd.info.ok ? 'You’re on the latest version.' : 'Update without re-downloading from GitHub.'}
        </div>
        {updAvailable && upd.phase !== 'checking' ? <UpdateAction /> : <button className="btn ghost small" disabled={upd.phase === 'checking'} onClick={checkUpdate}>Check for updates</button>}
        {updAvailable && upd.phase === 'error' && <button className="btn ghost small" onClick={checkUpdate}>Retry</button>}
      </div>
      <div className="about-tags"><span className="chiptag">Open source</span><span className="chiptag">macOS · Windows · Linux</span><span className="chiptag">No telemetry</span></div>
      <div className="about-links"><button className="btn primary" onClick={() => ext(REPO)}>View on GitHub</button><button className="btn ghost" onClick={() => ext(LINKEDIN)}>Built by Shahrukh Khan</button><button className="btn ghost" onClick={copyLogs}>{copied ? 'Copied ✓' : 'Copy diagnostics'}</button></div>
    </section>
  );

  const BridgeModal = bridgeFor && (
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
                const q = bridgeQuery.trim().toLowerCase();
                const allLabels = {};
                { const byP = {}; for (const x of all) (byP[x.project] = byP[x.project] || []).push(x); for (const k of Object.keys(byP)) allLabels[k] = projLabel(byP[k], k); }
                const matches = (x) => !q || (x.title || '').toLowerCase().includes(q) || (allLabels[x.project] || '').toLowerCase().includes(q) || (x.firstMessage || '').toLowerCase().includes(q);
                const visible = (x) => !hiddenProjects.has(x.project) && matches(x);
                const cmp = {
                  recent: (a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0),
                  oldest: (a, b) => (a.lastActivityAt || 0) - (b.lastActivityAt || 0),
                  name: (a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }),
                  project: (a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0),
                }[bridgeSort] || ((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));
                const inTab = all.filter((x) => x.status === bridgeTab && visible(x)).sort(cmp);
                const groups = {};
                for (const x of inTab) (groups[x.project] = groups[x.project] || []).push(x);
                // Group order follows the sort: newest/oldest activity first, or A–Z by name.
                const groupKeys = Object.keys(groups).sort((a, b) => {
                  if (bridgeSort === 'name' || bridgeSort === 'project') return allLabels[a].localeCompare(allLabels[b], undefined, { sensitivity: 'base' });
                  return cmp(groups[a][0], groups[b][0]);
                });
                const hiddenHere = [...hiddenProjects].filter((p) => allLabels[p]);
                const tabCount = (st) => all.filter((x) => x.status === st && visible(x)).length;
                const nNew = tabCount('new'), nUpd = tabCount('stale'), nCur = tabCount('current');
                const emptyMsg = q ? `No sessions match “${bridgeQuery.trim()}”.` : bridgeTab === 'new' ? 'No new sessions to import.' : bridgeTab === 'stale' ? 'No updates. Everything imported here is up to date.' : 'Nothing imported into this profile yet.';
                return (
                  <>
                    {bridgeResult && <div className="bridge-msg ok"><b>{bridgeResult.written || 0}</b> imported{bridgeResult.refreshed ? ', ' + bridgeResult.refreshed + ' updated' : ''}{bridgeResult.repaired ? ', ' + bridgeResult.repaired + ' repaired' : ''}{bridgeResult.removedDuplicates ? ', ' + bridgeResult.removedDuplicates + ' duplicate' + (bridgeResult.removedDuplicates > 1 ? 's' : '') + ' removed' : ''}. Fully quit and reopen “{bridgeFor.name}” to see the changes.</div>}
                    <div className="sess-legend">Conversations are a single shared file, so their content stays current across profiles. This only sets what “{bridgeFor.name}” shows in its sidebar.</div>
                    <div className="bridge-tabs">
                      {[['new', 'New', nNew], ['stale', 'Updates', nUpd], ['current', 'Up to date', nCur]].map(([k, l, c]) => (
                        <button key={k} type="button" className={'btab' + (bridgeTab === k ? ' on' : '')} onClick={() => setBridgeTab(k)}>{l} <span className="btab-n">{c}</span></button>
                      ))}
                    </div>
                    <div className="sess-filter">
                      <input className="sess-search" type="search" placeholder="Search sessions or projects…" value={bridgeQuery} onChange={(e) => setBridgeQuery(e.target.value)} />
                      <select className="sess-sort" value={bridgeSort} onChange={(e) => changeSort(e.target.value)} aria-label="Sort sessions">
                        {SESS_SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </div>
                    {hiddenHere.length > 0 && (
                      <div className="hidden-proj">
                        <span className="hp-lbl">Hidden:</span>
                        {hiddenHere.map((p) => <button key={p} type="button" className="hp-chip" title={'Show ' + allLabels[p] + ' again'} onClick={() => showProject(p)}>{allLabels[p]} <span aria-hidden="true">+</span></button>)}
                        <button type="button" className="linklike" onClick={() => saveHidden(new Set())}>Show all</button>
                      </div>
                    )}
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
                          {groupKeys.map((proj) => {
                            const list = groups[proj];
                            const actionable = list.filter((x) => x.status !== 'current').map((x) => x.cliSessionId);
                            const allSel = actionable.length > 0 && actionable.every((id) => bridgeSel.has(id));
                            const collapsed = bridgeCollapsed.has(proj);
                            return (
                              <div className={'sessgroup' + (collapsed ? ' collapsed' : '')} key={proj}>
                                <div className="sessgroup-h">
                                  <input type="checkbox" disabled={actionable.length === 0} checked={allSel} onChange={() => toggleGroup(actionable)} aria-label={'Select all in ' + allLabels[proj]} />
                                  <button type="button" className="sessgroup-name" onClick={() => toggleCollapse(proj)} aria-expanded={!collapsed} title={((list.find((x) => x.cwd) || {}).cwd || proj) + (collapsed ? ' (click to expand)' : ' (click to collapse)')}>
                                    <Chevron open={!collapsed} /><span className="sessgroup-label">{allLabels[proj]}</span>
                                    <span className="sessgroup-count">{list.length} session{list.length === 1 ? '' : 's'}</span>
                                  </button>
                                  <button type="button" className="sessgroup-hide" title={'Hide ' + allLabels[proj] + ' from this import list. Nothing is deleted; bring it back from “Hidden” above.'} onClick={() => hideProject(proj, list.map((x) => x.cliSessionId))}><EyeOff /><span>Hide</span></button>
                                </div>
                                {!collapsed && (
                                  <div className="sessgroup-b">
                                    {asTree(list).map(({ x, depth }) => (
                                      <label key={x.cliSessionId} className={'sess' + (depth ? ' child' : '') + (x.status === 'current' ? ' done' : '')} style={depth ? { '--depth': depth } : undefined}>
                                        <input type="checkbox" disabled={x.status === 'current'} checked={bridgeSel.has(x.cliSessionId)} onChange={() => toggleSel(x.cliSessionId)} />
                                        <span className="sess-main">
                                          <span className="sess-title" title={x.title}>{depth ? <span className="sess-branch" aria-hidden="true">↳</span> : null}{x.title}</span>
                                          <span className="sess-meta">
                                            {x.lastActivityAt ? new Date(x.lastActivityAt).toLocaleDateString() : ''}
                                            {depth ? <span className="sess-tag sub">sub-session</span> : null}
                                            {x.repair ? <span className="sess-tag fix" title={'Imported by an older version' + (x.duplicates ? '; also removes ' + x.duplicates + ' duplicate entr' + (x.duplicates > 1 ? 'ies' : 'y') : '') + '. Updating fixes its nesting.'}>needs repair</span> : null}
                                          </span>
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                )}
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
        <main className="page wide">{screen === 'settings' ? <>{Appearance}{Updates}{Sessions}</> : screen === 'archive' ? Archived : About}</main>
        {BridgeModal}
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
              <button className="menu-upd" onClick={menuUpdate} disabled={upd.phase === 'checking'}>
                {updAvailable
                  ? <><span className="upd-dot" />{upd.phase === 'ready' ? 'Restart & install' : upd.phase === 'downloading' ? `Downloading… ${Math.round(upd.progress * 100)}%` : `Update to v${upd.info.latest}`}</>
                  : upd.phase === 'checking' ? 'Checking…' : 'Check for updates'}
              </button>
              <div className="menu-sep" />
              <button onClick={() => { setScreen('archive'); setMenuOpen(false); }}>Archived</button>
              <button onClick={() => { setScreen('settings'); setMenuOpen(false); }}>Settings</button>
              <button onClick={() => { setScreen('about'); setMenuOpen(false); }}>About</button>
            </div>
          </>)}
        </div>
        <div className="brand"><img className="octo-mark" src={octoMark} alt="" /><span>Claude Profiles</span>{appVersion && <button type="button" className="brand-ver" title="About Claude Profiles" onClick={() => setScreen('about')}>v{appVersion}</button>}</div>
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
                {formIsCustom && dockPreview && (
                  <div className="dock-preview" title="How it will look in the Dock: same size and rounded shape as other apps">
                    <img src={dockPreview} alt="Dock icon preview" />
                    <span>Dock</span>
                  </div>
                )}
                <div className="preview-actions">
                  {confirmRemoveImg ? (
                    <div className="rm-confirm">
                      <span>Remove this image?</span>
                      <button className="btn ghost small" onClick={() => setConfirmRemoveImg(false)}>Keep</button>
                      <button className="btn danger small" onClick={() => { setIconData(null); setIconPath(null); setIconDirty(true); setConfirmRemoveImg(false); }}>Remove</button>
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

      {updAvailable && !upd.dismissed && (
        <div className="upd-banner">
          <span className="upd-dot" />
          <div className="upd-txt">Claude Profiles <b>{upd.info.latest}</b> is available{upd.phase === 'error' ? <span className="upd-err"> · {upd.error}</span> : null}</div>
          <UpdateAction />
          {upd.phase !== 'downloading' && upd.phase !== 'installing' && <button className="x" title="Later" onClick={() => setUpd((u) => ({ ...u, dismissed: true }))}>✕</button>}
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
              {it.updateAvailable && <button className="btn small amber" onClick={() => fixClone(it)}>Update</button>}
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
                  {detail.mode === 'custom' && <button className={'btn ' + (detail.updateAvailable ? 'amber' : 'ghost')} onClick={() => { const it = instances.find((i) => i.id === detail.id) || detail; setDetail(null); fixClone(it); }}>Rebuild</button>}
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
      {BridgeModal}
      {toast && <div className="toast" role="status">{toast}</div>}
      {cropSrc && <Cropper src={cropSrc} onCancel={() => setCropSrc(null)} onDone={(d) => { setIconData(d); setIconDirty(true); setCropSrc(null); }} />}
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
