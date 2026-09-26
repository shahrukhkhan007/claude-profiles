import React, { useEffect, useState, useCallback } from 'react';

const COLORS = ['blue', 'green', 'coral', 'violet', 'slate'];
const TABS = [{ key: 'simple', label: 'Quick Launch' }, { key: 'custom', label: 'Custom' }];
const THEMES = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark'], ['darker', 'Darker']];
const api = typeof window !== 'undefined' ? window.api : undefined;

const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
function initials(name) { return String(name).trim().slice(0, 1).toUpperCase() || 'C'; }
function fmt(dt) { try { return dt ? new Date(dt).toLocaleString() : '—'; } catch (_) { return '—'; } }

function Avatar({ color, iconData, name, lg }) {
  return (
    <div className={'icon ' + (color || 'blue') + (lg ? ' lg' : '')}>
      {iconData ? <img src={iconData} alt="" /> : initials(name)}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('simple');
  const [env, setEnv] = useState(null);
  const [instances, setInstances] = useState([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const [iconPath, setIconPath] = useState(null);
  const [iconData, setIconData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [confirmStop, setConfirmStop] = useState(null);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(() => lsGet('theme', 'system'));
  const [glass, setGlass] = useState(() => lsGet('glass', '0') === '1');

  const refresh = useCallback(async () => { if (api) setInstances(await api.list()); }, []);
  const softRefresh = useCallback(() => { refresh(); setTimeout(refresh, 1000); }, [refresh]);
  const launchAndRefresh = useCallback((id) => api.launch(id).then(() => { refresh(); setTimeout(refresh, 1200); }), [refresh]);
  const openDetail = async (id) => setDetail(await api.detail(id));

  useEffect(() => { if (!api) return; api.envInfo().then(setEnv); refresh(); }, [refresh]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    lsSet('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('glass', glass);
    lsSet('glass', glass ? '1' : '0');
    if (api && api.setGlass) api.setGlass(glass);
  }, [glass]);

  const pick = async () => { const r = await api.pickIcon(); if (r) { setIconPath(r.path); setIconData(r.dataUrl); } };
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await api.add({ name: name.trim(), mode: tab, color, iconPath, iconData });
    setName(''); setColor('blue'); setIconPath(null); setIconData(null); setAdding(false); setBusy(false);
    refresh();
  };
  const doStop = (id) => api.stop(id).then(() => { setConfirmStop(null); setDetail(null); softRefresh(); });

  const rows = instances.filter((i) => i.mode === tab);

  if (!api) {
    return <div className="fallback"><h1>Claude Profiles</h1><p>Run <code>pnpm dev</code> to open this inside the app.</p></div>;
  }

  return (
    <div className={'app' + (env && env.os === 'darwin' ? ' is-mac' : '')}>
      <header className="topbar">
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={'tab' + (tab === t.key ? ' active' : '')}
              onClick={() => { setTab(t.key); setAdding(false); }}>{t.label}</button>
          ))}
        </div>
        <div className="spacer" />
        <button className="icon-btn" title="Settings" onClick={() => setSettings(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <button className="btn primary" onClick={() => setAdding((v) => !v)}>+ Add</button>
      </header>

      {adding && (
        <div className="addbar">
          <input autoFocus placeholder="Profile name (e.g. Work)" value={name}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          <div className="swatches">
            {COLORS.map((c) => (
              <button key={c} className={'sw ' + c + (color === c && !iconData ? ' sel' : '')}
                onClick={() => { setColor(c); setIconData(null); setIconPath(null); }} aria-label={c} />
            ))}
          </div>
          <button className="btn ghost small" onClick={pick}>{iconData ? '✓ image' : 'Image'}</button>
          <button className="btn primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create'}</button>
        </div>
      )}

      <main className="list">
        {rows.length === 0 && (
          <div className="empty">
            <p>No {tab === 'simple' ? 'quick-launch' : 'custom'} profiles yet.</p>
            <button className="btn primary" onClick={() => setAdding(true)}>+ Add your first</button>
          </div>
        )}
        {rows.map((it) => (
          <div className={'card' + (it.running ? ' run' : '')} key={it.id} onClick={() => openDetail(it.id)}>
            <Avatar color={it.color} iconData={it.iconData} name={it.name} />
            <div className="who">
              <div className="nm">{it.name}<span className="pill">{it.mode}</span>
                {it.updateAvailable && <span className="badge-upd">update</span>}
                {it.buildError && <span className="badge-err">error</span>}
              </div>
              <div className="sub">{it.lastLaunchedAt ? 'Last opened ' + new Date(it.lastLaunchedAt).toLocaleDateString() : (it.mode === 'custom' ? 'Custom profile' : 'Quick-launch profile')}</div>
            </div>
            <div className={'status' + (it.running ? ' on' : '')}><span className="dot" />{it.running ? 'Running' : 'Stopped'}</div>
            <div className="actions" onClick={(e) => e.stopPropagation()}>
              {it.updateAvailable && <button className="btn small amber" onClick={() => api.rebuild(it.id).then(refresh)}>Update</button>}
              {it.running ? (
                <>
                  <button className="btn small ghost" onClick={() => api.launch(it.id).then(refresh)}>Front</button>
                  <button className="btn small danger" onClick={() => setConfirmStop(it)}>Stop</button>
                </>
              ) : (
                <button className="btn small primary" onClick={() => launchAndRefresh(it.id)}>Launch</button>
              )}
            </div>
          </div>
        ))}
      </main>

      <footer className="statusbar">
        <span className="cd" />
        {env ? <>Claude {env.version || '—'} · {env.claudeApp ? 'detected' : 'not found'}</> : 'Loading…'}
        <span className="credit">Built by <b>Shahrukh Khan</b></span>
      </footer>

      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="sheet2" onClick={(e) => e.stopPropagation()}>
            <div className="d-top">
              <Avatar color={detail.color} iconData={detail.iconData} name={detail.name} lg />
              <div>
                <div className="d-name">{detail.name}<span className="pill">{detail.mode}</span></div>
                <div className={'status' + (detail.running ? ' on' : '')} style={{ marginTop: 6 }}>
                  <span className="dot" />{detail.running ? ('Running' + (detail.uptime ? ' · ' + detail.uptime : '')) : 'Stopped'}</div>
              </div>
              <button className="x" onClick={() => setDetail(null)}>✕</button>
            </div>
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
              {detail.running
                ? <button className="btn primary" onClick={() => api.launch(detail.id)}>Bring to front</button>
                : <button className="btn primary" onClick={() => { launchAndRefresh(detail.id); setDetail(null); }}>Launch</button>}
              {detail.running && <button className="btn danger" onClick={() => setConfirmStop(detail)}>Stop</button>}
              {detail.updateAvailable && <button className="btn amber" onClick={() => api.rebuild(detail.id).then(() => { setDetail(null); refresh(); })}>Rebuild</button>}
              <button className="btn danger" onClick={() => api.remove(detail.id).then(() => { setDetail(null); refresh(); })}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {confirmStop && (
        <div className="overlay" onClick={() => setConfirmStop(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><h3>Stop “{confirmStop.name}”?</h3>
              <p>This quits the running window. The profile, its login and history stay — you can relaunch it anytime.</p></div>
            <div className="modal-f">
              <button className="btn ghost" onClick={() => setConfirmStop(null)}>Cancel</button>
              <button className="btn danger" onClick={() => doStop(confirmStop.id)}>Stop</button>
            </div>
          </div>
        </div>
      )}

      {settings && (
        <div className="overlay" onClick={() => setSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><h3>Settings</h3></div>
            <div className="modal-b">
              <div className="set-row">
                <div><div className="lbl">Theme</div><div className="hint">Overrides your system setting</div></div>
                <div className="seg">
                  {THEMES.map(([k, l]) => (
                    <button key={k} className={theme === k ? 'on' : ''} onClick={() => setTheme(k)}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="set-row">
                <div><div className="lbl">Glass effect</div><div className="hint">Frosted, translucent surfaces</div></div>
                <button className={'toggle' + (glass ? ' on' : '')} onClick={() => setGlass((v) => !v)} aria-label="Glass effect">
                  <span className="knob" />
                </button>
              </div>
            </div>
            <div className="modal-f"><button className="btn primary" onClick={() => setSettings(false)}>Done</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
