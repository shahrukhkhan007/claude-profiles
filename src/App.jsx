import React, { useEffect, useState, useCallback } from 'react';

const COLORS = ['blue', 'green', 'coral', 'violet', 'slate'];
const TABS = [
  { key: 'simple', label: 'Quick Launch' },
  { key: 'custom', label: 'Custom' },
];
const api = typeof window !== 'undefined' ? window.api : undefined;

function initials(name) { return String(name).trim().slice(0, 1).toUpperCase() || 'C'; }
function fmt(dt) { try { return dt ? new Date(dt).toLocaleString() : '—'; } catch (_) { return '—'; } }

export default function App() {
  const [tab, setTab] = useState('simple');
  const [env, setEnv] = useState(null);
  const [instances, setInstances] = useState([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const [iconPath, setIconPath] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!api) return;
    setInstances(await api.list());
  }, []);

  useEffect(() => { if (!api) return; api.envInfo().then(setEnv); refresh(); }, [refresh]);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    await api.add({ name: name.trim(), mode: tab, color, iconPath });
    setName(''); setColor('blue'); setIconPath(null); setAdding(false); setBusy(false);
    refresh();
  };

  const openDetail = async (id) => { setDetail(await api.detail(id)); };

  const rows = instances.filter((i) => i.mode === tab);

  if (!api) {
    return (
      <div className="fallback">
        <h1>Claude Profiles</h1>
        <p>Run <code>pnpm dev</code> to open this inside the app, where it can talk to the engine.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key} className={'tab' + (tab === t.key ? ' active' : '')}
              onClick={() => { setTab(t.key); setAdding(false); }}>{t.label}</button>
          ))}
        </div>
        <button className="btn primary" onClick={() => setAdding((v) => !v)}>+ Add</button>
      </header>

      {adding && (
        <div className="addbar">
          <input autoFocus placeholder="Profile name (e.g. Work)" value={name}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          <div className="swatches">
            {COLORS.map((c) => (
              <button key={c} className={'sw ' + c + (color === c ? ' sel' : '')}
                onClick={() => setColor(c)} aria-label={c} />
            ))}
          </div>
          {tab === 'custom' && (
            <button className="btn ghost small" onClick={async () => { const p = await api.pickIcon(); if (p) setIconPath(p); }}>
              {iconPath ? '✓ icon' : 'Choose icon'}
            </button>
          )}
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
            <div className={'icon ' + (it.color || 'blue')}>{initials(it.name)}</div>
            <div className="who">
              <div className="nm">{it.name}<span className="pill">{it.mode}</span>
                {it.updateAvailable && <span className="badge-upd">update</span>}
                {it.buildError && <span className="badge-err">error</span>}
              </div>
              <div className="sub">{it.dataDir}</div>
            </div>
            <div className={'status' + (it.running ? ' on' : '')}><span className="dot" />{it.running ? 'Running' : 'Stopped'}</div>
            <div className="actions" onClick={(e) => e.stopPropagation()}>
              {it.updateAvailable && (
                <button className="btn small amber" onClick={() => api.rebuild(it.id).then(refresh)}>Update</button>
              )}
              <button className="btn small primary" onClick={() => api.launch(it.id).then(refresh)}>
                {it.running ? 'Front' : 'Launch'}
              </button>
            </div>
          </div>
        ))}
      </main>

      <footer className="statusbar">
        <span className="cd" />
        {env ? <>Claude {env.version || '—'} · {env.claudeApp ? 'detected' : 'not found'} · {rows.length} in this tab</> : 'Loading…'}
      </footer>

      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="sheet2" onClick={(e) => e.stopPropagation()}>
            <div className="d-top">
              <div className={'icon lg ' + (detail.color || 'blue')}>{initials(detail.name)}</div>
              <div>
                <div className="d-name">{detail.name}<span className="pill">{detail.mode}</span></div>
                <div className={'status' + (detail.running ? ' on' : '')}><span className="dot" />
                  {detail.running ? `Running${detail.uptime ? ' · ' + detail.uptime : ''}` : 'Stopped'}</div>
              </div>
              <button className="x" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="mgrid">
              <div className="kv"><span className="k">Created</span><span className="v">{fmt(detail.createdAt)}</span></div>
              <div className="kv"><span className="k">Last launched</span><span className="v">{fmt(detail.lastLaunchedAt)}</span></div>
              <div className="kv"><span className="k">Uptime</span><span className="v">{detail.uptime || '—'}</span></div>
              <div className="kv"><span className="k">Memory</span><span className="v">{detail.memoryMB ? detail.memoryMB + ' MB' : '—'}</span></div>
              <div className="kv"><span className="k">Claude version</span><span className="v">{detail.claudeVersion || '—'}</span></div>
              <div className="kv"><span className="k">Launches</span><span className="v">{detail.launches || 0}</span></div>
              <div className="kv full"><span className="k">Data folder</span><span className="v mono">{detail.dataDir}</span></div>
              {detail.bundlePath && <div className="kv full"><span className="k">App</span><span className="v mono">{detail.bundlePath}</span></div>}
            </div>
            <div className="d-actions">
              <button className="btn primary" onClick={() => api.bringToFront(detail.id)}>Bring to front</button>
              <button className="btn ghost" onClick={() => api.reveal(detail.id)}>Reveal</button>
              {detail.updateAvailable && (
                <button className="btn amber" onClick={() => api.rebuild(detail.id).then(() => { setDetail(null); refresh(); })}>Rebuild</button>
              )}
              <button className="btn danger" onClick={() => api.remove(detail.id).then(() => { setDetail(null); refresh(); })}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
