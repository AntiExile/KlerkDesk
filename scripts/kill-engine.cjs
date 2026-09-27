const { execSync } = require('child_process');

const PORT = 14205;

try {
  if (process.platform === 'win32') {
    // Windows: Use PowerShell to stop the process listening on port 14205
    execSync(
      `powershell -NoProfile -NonInteractive -Command "Get-NetTCPConnection -LocalPort ${PORT} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'ignore' }
    );
  } else {
    // macOS / Linux: Use lsof and kill directly without failing if port is empty
    execSync(`lsof -ti :${PORT} | xargs kill -9 2>/dev/null || true`, {
      stdio: 'ignore',
      shell: '/bin/sh',
    });
  }
  console.log(`Port ${PORT} cleared`);
} catch (_err) {
  console.log(`Port ${PORT} cleared or already free`);
}
