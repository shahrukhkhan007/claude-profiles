import React, { useEffect, useState, useCallback } from 'react';

const COLORS = ['blue', 'green', 'coral', 'violet', 'slate'];
const TABS = [
  { key: 'simple', label: 'Quick Launch' },
  { key: 'custom', label: 'Custom' },
];

const api = typeof window !== 'undefined' ? window.api : undefined;

export default function App() {
  const [tab, setTab] = useState('simple');
  const [env, setEnv] = useState(null);
  const [instances, setInstances] = useState([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');

  const refresh = useCallback(async () => {
    if (!api) return;
    setInstances(await api.list());
  }, []);

  useEffect(() => {
    if (!api) return;
    api.envInfo().then(setEnv);
    refresh();
  }, [refresh]);

  const create = async () => {
    if (!name.trim()) return;
    await api.add({ name: name.trim(), mode: tab, color });
    setName(''); setColor('blue'); setAdding(false);
    refresh();
  };

  const rows = instances.filter((i) => i.mode === tab);

  if (!api) {
    return (
      <div className="fallback">
        <h1>Claude Profiles</h1>
        <p>This is the Electron renderer. Run <code>npm run dev</code> to launch it inside the app,
        where it can talk to the engine.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.key}
              className={'tab' + (tab === t.key ? ' active' : '')}
              onClick={() => { setTab(t.key); setAdding(false); }}>
              {t.label}
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={() => setAdding((v) => !v)}>+ Add</button>
      </header>

      {adding && (
        <div className="addbar">
          <input autoFocus placeholder="Profile name (e.g. Work)"
            value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()} />
          <div className="swatches">
            {COLORS.map((c) => (
              <button key={c} className={'sw ' + c + (color === c ? ' sel' : '')}
                onClick={() => setColor(c)} aria-label={c} />
            ))}
          </div>
          <button className="btn primary" onClick={create}>Create</button>
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
          <div className={'card' + (it.running ? ' run' : '')} key={it.id}>
            <div className={'icon ' + (it.color || 'blue')}>{initials(it.name)}</div>
            <div className="who">
              <div className="nm">{it.name}<span className="pill">{it.mode}</span></div>
              <div className="sub">{it.dataDir}</div>
            </div>
            <div className={'status' + (it.running ? ' on' : '')}>
              <span className="dot" />{it.running ? 'Running' : 'Stopped'}
            </div>
            <div className="actions">
              <button className="btn small primary" onClick={() => api.launch(it.id).then(refresh)}>
                {it.running ? 'Front' : 'Launch'}
              </button>
              <button className="btn small ghost" onClick={() => api.remove(it.id).then(refresh)}>Remove</button>
            </div>
          </div>
        ))}
      </main>

      <footer className="statusbar">
        <span className="cd" />
        {env
          ? <>Claude {env.version || '—'} · {env.claudeApp ? 'detected' : 'not found'} · {rows.length} in this tab</>
          : 'Loading…'}
      </footer>
    </div>
  );
}

function initials(name) {
  return String(name).trim().slice(0, 1).toUpperCase() || 'C';
}
