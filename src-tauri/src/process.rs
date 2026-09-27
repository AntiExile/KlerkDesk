use std::net::TcpListener;
use std::time::{Duration, Instant};

/// Checks if a TCP port on localhost is currently bound and in use.
pub fn is_port_in_use(port: u16) -> bool {
    // If binding succeeds, the port was free.
    // If binding fails, the port is occupied.
    TcpListener::bind(("127.0.0.1", port)).is_err()
}

/// Waits until a port becomes available or until timeout expires.
pub fn wait_for_port_free(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if !is_port_in_use(port) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    !is_port_in_use(port)
}

/// Cross-platform helper to kill any process currently occupying `port`.
/// Works on Windows via PowerShell/Get-NetTCPConnection and Unix via lsof/kill.
pub fn kill_process_on_port(port: u16) {
    if !is_port_in_use(port) {
        return;
    }

    println!("[Terra] Port {} is in use. Terminating orphaned process...", port);

    #[cfg(target_os = "windows")]
    {
        // Windows: query Get-NetTCPConnection for the owning process and force-stop it
        let script = format!(
            "Get-NetTCPConnection -LocalPort {} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object {{ Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }}",
            port
        );
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output();
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Unix (macOS / Linux): run lsof directly without shell wrapper to find PIDs
        if let Ok(output) = std::process::Command::new("lsof")
            .args(["-ti", &format!(":{}", port)])
            .output()
        {
            let pid_str = String::from_utf8_lossy(&output.stdout);
            for line in pid_str.lines() {
                let pid = line.trim();
                if !pid.is_empty() {
                    let _ = std::process::Command::new("kill")
                        .args(["-9", pid])
                        .output();
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_port_in_use_on_free_port() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        assert!(!is_port_in_use(port));
    }

    #[test]
    fn test_is_port_in_use_on_active_port() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();

        assert!(is_port_in_use(port));
        drop(listener);
        assert!(!is_port_in_use(port));
    }
}
