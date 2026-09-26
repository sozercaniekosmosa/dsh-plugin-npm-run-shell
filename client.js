// Client-half for npm-run-shell Cordis plugin
export function apply(ctx) {
  const slots = ctx.get('slots');
  if (!slots) return;

  // Регистрируемся под id: 'cordis-panel', заменяя стандартную серую кнопку плагинов Cordis
  slots.inject('sidebar.footer.action', () => slots.register(
    { name: 'sidebar.footer.action', id: 'cordis-panel', label: 'NPM Scripts' },
    (props) => {
      const [isOpen, setIsOpen] = React.useState(false);
      const [selectedPath, setSelectedPath] = React.useState('');
      const [workspacesState, setWorkspacesState] = React.useState([]);
      const [scriptsData, setScriptsData] = React.useState({ scripts: [], cwd: '', loading: false, error: null });
      const containerRef = React.useRef(null);

      // Закрытие попапа при клике вне его области
      React.useEffect(() => {
        if (!isOpen) return;
        const handleMouseDown = (e) => {
          if (containerRef.current && !containerRef.current.contains(e.target)) {
            setIsOpen(false);
          }
        };
        window.addEventListener('mousedown', handleMouseDown);
        return () => window.removeEventListener('mousedown', handleMouseDown);
      }, [isOpen]);

      // Хуки сессий и воркспейсов DSH из стандартных свойств слота
      const sessionsSnapshot = props && typeof props.useSessions === 'function'
        ? props.useSessions((s) => s)
        : null;

      const workspacesList = props && typeof props.useWorkspaces === 'function'
        ? props.useWorkspaces((s) => (s && s.items ? s.items : []))
        : [];

      // Автоматическое вычисление активного воркспейса
      const detectedActivePath = React.useMemo(() => {
        if (!sessionsSnapshot) return '';
        const currentId = sessionsSnapshot.current;
        const currentSession = currentId ? sessionsSnapshot.byId?.[currentId] : null;

        if (currentSession && currentSession.cwd && workspacesList.length > 0) {
          const match = workspacesList.find((w) => currentSession.cwd.startsWith(w.path));
          if (match) return match.path;
        }

        if (currentId && workspacesList.length > 0) {
          const match = workspacesList.find((w) => w.sessionIds && w.sessionIds.includes(currentId));
          if (match) return match.path;
        }

        if (currentSession && currentSession.cwd) {
          return currentSession.cwd;
        }

        if (workspacesList.length > 0) {
          return workspacesList[workspacesList.length - 1].path;
        }

        return '';
      }, [sessionsSnapshot, workspacesList]);

      // Синхронизация выбранного пути при смене активной рабочей области
      React.useEffect(() => {
        if (detectedActivePath) {
          setSelectedPath(detectedActivePath);
        }
      }, [detectedActivePath]);

      // Загрузка данных скриптов через Host RPC
      const loadScripts = async (targetPath) => {
        setScriptsData((prev) => ({ ...prev, loading: true, error: null }));
        try {
          const res = await host.call('get-data', { clientCwd: targetPath || selectedPath || detectedActivePath });
          if (res && res.workspaces && res.workspaces.length > 0) {
            setWorkspacesState(res.workspaces);
          }
          if (res && res.cwd) {
            setSelectedPath(res.wsPath || targetPath);
          }
          setScriptsData({
            scripts: res ? res.scripts : [],
            cwd: res ? res.cwd : '',
            loading: false,
            error: res && res.error ? res.error : null
          });
        } catch (e) {
          setScriptsData({ scripts: [], cwd: '', loading: false, error: e.message });
        }
      };

      const toggleOpen = () => {
        if (!isOpen) {
          loadScripts(selectedPath || detectedActivePath);
        }
        setIsOpen(!isOpen);
      };

      const handleWorkspaceChange = (e) => {
        const newPath = e.target.value;
        setSelectedPath(newPath);
        loadScripts(newPath);
      };

      const runScript = async (scriptName) => {
        try {
          const res = await host.call('run-script', { script: scriptName, cwd: scriptsData.cwd });
          if (res && res.success) {
            setIsOpen(false);
          } else {
            alert('Ошибка запуска: ' + (res && res.error ? res.error : 'Неизвестная ошибка'));
          }
        } catch (e) {
          alert('Ошибка вызова: ' + e.message);
        }
      };

      const allWorkspaces = React.useMemo(() => {
        const map = new Map();
        for (const w of workspacesList) {
          if (w && w.path) map.set(w.path, { title: w.title || w.path.split('\\').pop(), path: w.path });
        }
        for (const w of workspacesState) {
          if (w && w.path && !map.has(w.path)) map.set(w.path, w);
        }
        return Array.from(map.values());
      }, [workspacesList, workspacesState]);

      // Официальная иконка NPM
      const npmIcon = React.createElement('svg', {
        viewBox: '0 0 16 16',
        width: '18',
        height: '18',
        style: { display: 'block', borderRadius: '2px' }
      },
        React.createElement('rect', { width: '16', height: '16', rx: '2', fill: '#CB3837' }),
        React.createElement('path', { d: 'M3 3h10v10H9v-7H7v7H3V3z', fill: '#FFFFFF' })
      );

      return React.createElement('div', {
        ref: containerRef,
        style: { position: 'relative', display: 'inline-block' }
      },
        React.createElement('button', {
          type: 'button',
          onClick: toggleOpen,
          title: 'NPM скрипты',
          style: {
            cursor: 'pointer',
            padding: '6px',
            background: isOpen ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
            border: 'none',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s ease'
          }
        }, npmIcon),

        isOpen && React.createElement('div', {
          style: {
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '0',
            background: '#1e1e24',
            color: '#e4e4e7',
            border: '1px solid #33333d',
            borderRadius: '8px',
            minWidth: '260px',
            maxWidth: '340px',
            maxHeight: '400px',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9999,
            boxShadow: '0 10px 28px rgba(0, 0, 0, 0.5)',
            fontSize: '12px',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }
        },
          // Шапка попапа с выбором активного воркспейса
          React.createElement('div', {
            style: {
              padding: '10px 12px 8px',
              borderBottom: '1px solid #2e2e38',
              background: 'rgba(255, 255, 255, 0.02)'
            }
          },
            React.createElement('div', {
              style: {
                fontWeight: 600,
                fontSize: '11px',
                color: '#90909f',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }
            }, 'Активный Workspace:'),

            allWorkspaces.length > 1
              ? React.createElement('select', {
                  value: selectedPath || (allWorkspaces[0] && allWorkspaces[0].path),
                  onChange: handleWorkspaceChange,
                  style: {
                    width: '100%',
                    background: '#2b2b36',
                    color: '#ffffff',
                    border: '1px solid #444452',
                    borderRadius: '4px',
                    padding: '5px 8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none'
                  }
                },
                  allWorkspaces.map((w) => React.createElement('option', {
                    key: w.path,
                    value: w.path,
                    style: { background: '#1e1e24', color: '#fff' }
                  }, w.title || w.path.split('\\').pop()))
                )
              : React.createElement('div', {
                  style: {
                    fontWeight: 600,
                    fontSize: '13px',
                    color: '#ffffff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }
                }, (allWorkspaces[0] && allWorkspaces[0].title) || selectedPath.split('\\').pop() || 'Workspace'),

            scriptsData.cwd && React.createElement('div', {
              title: scriptsData.cwd,
              style: {
                fontSize: '10px',
                color: '#71717a',
                marginTop: '4px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }
            }, scriptsData.cwd)
          ),

          // Список скриптов
          React.createElement('div', {
            style: {
              padding: '6px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }
          },
            scriptsData.loading
              ? React.createElement('div', { style: { padding: '16px', textAlign: 'center', color: '#888' } }, 'Загрузка скриптов...')
              : scriptsData.scripts && scriptsData.scripts.length > 0
                ? scriptsData.scripts.map((s) => React.createElement('button', {
                    key: s,
                    type: 'button',
                    onClick: () => runScript(s),
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      textAlign: 'left',
                      background: 'transparent',
                      color: '#d4d4d8',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontFamily: 'Consolas, Monaco, monospace'
                    },
                    onMouseEnter: (e) => {
                      e.currentTarget.style.background = 'rgba(203, 56, 55, 0.18)';
                      e.currentTarget.style.color = '#ffffff';
                    },
                    onMouseLeave: (e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#d4d4d8';
                    }
                  },
                    React.createElement('span', { style: { color: '#10b981', fontSize: '10px' } }, '▶'),
                    React.createElement('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' } }, s)
                  ))
                : React.createElement('div', {
                    style: { padding: '16px', textAlign: 'center', color: '#ef4444' }
                  }, scriptsData.error || 'package.json со скриптами не найден')
          )
        )
      );
    }
  ));
}

export default {
  apply
};
