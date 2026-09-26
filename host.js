// Host-half for npm-run-shell Cordis plugin
export const inject = ['fs', 'workspaceRegistry', 'subprocess'];

export function apply(ctx) {
  // RPC: Получение доступных воркспейсов и списка NPM-скриптов
  harness.handle('get-data', async (args) => {
    try {
      const list = ctx.workspaceRegistry.list();
      const availableWorkspaces = list.map((w) => ({
        title: w.title || w.path.split('\\').pop(),
        path: w.path
      }));

      const candidateRoots = [];

      // Если клиент запросил конкретный путь (например, выбранный в селекторе или активный в сессии):
      if (args && typeof args.clientCwd === 'string' && args.clientCwd) {
        candidateRoots.push(args.clientCwd);
      }

      // Добавляем все остальные зарегистрированные воркспейсы (с конца — самые свежие)
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i].path;
        if (!candidateRoots.includes(p)) {
          candidateRoots.push(p);
        }
      }

      // Поиск package.json в корнях и вложенных каталогах (prj, src)
      for (const rootDir of candidateRoots) {
        const subdirs = [rootDir, rootDir + '\\prj', rootDir + '\\src'];
        for (const d of subdirs) {
          try {
            const target = await ctx.fs.resolve(d + '\\package.json');
            const content = await ctx.fs.readText(target);
            const json = JSON.parse(content);

            if (json && json.scripts && Object.keys(json.scripts).length > 0) {
              const matchedWs = list.find((w) => d.startsWith(w.path));
              const wsTitle = matchedWs && matchedWs.title ? matchedWs.title : d.split('\\').pop();

              return {
                wsName: wsTitle,
                wsPath: matchedWs ? matchedWs.path : rootDir,
                cwd: d,
                scripts: Object.keys(json.scripts),
                workspaces: availableWorkspaces,
                error: null
              };
            }
          } catch (e) {
            // Файл отсутствует или не читается — продолжаем поиск
          }
        }
      }

      return {
        wsName: candidateRoots[0]?.split('\\').pop() || 'Workspace',
        wsPath: candidateRoots[0] || '',
        cwd: candidateRoots[0] || '',
        scripts: [],
        workspaces: availableWorkspaces,
        error: 'В этом проекте package.json со скриптами не найден'
      };
    } catch (err) {
      return {
        wsName: 'Ошибка',
        wsPath: '',
        cwd: '',
        scripts: [],
        workspaces: [],
        error: err.message
      };
    }
  });

  // RPC: Запуск выбранного скрипта в отдельном интерактивном окне терминала Windows
  harness.handle('run-script', async (args) => {
    try {
      if (!args || !args.script || !args.cwd) {
        return { success: false, error: 'Не указан скрипт или рабочая директория' };
      }

      const cmdExecutable = await ctx.subprocess.resolveExecutable('cmd.exe');

      // Запускаем через системный subprocess cmd.exe /c start "npm: <script>" cmd.exe /k npm run <script>
      // Это открывает настоящее окно командной строки Windows, которое не блокируется песочницей
      // и сохраняет процесс открытым для просмотра логов dev-серверов или билдов.
      ctx.subprocess.spawn({
        argv: [
          cmdExecutable,
          '/c',
          'start',
          'npm: ' + args.script,
          'cmd.exe',
          '/k',
          'npm run ' + args.script
        ],
        cwd: args.cwd,
        stdio: {
          stdin: 'ignore',
          stdout: 'inherit',
          stderr: 'inherit'
        },
        graceMs: 5000
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

export default {
  inject,
  apply
};
