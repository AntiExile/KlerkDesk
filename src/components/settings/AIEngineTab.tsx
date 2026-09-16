import { useState, useEffect, useRef } from 'react';
import { Upload, Cpu, Zap, RotateCw, Play, Terminal, Copy, Check } from 'lucide-react';
import { Toggle } from '@/components/ui/Toggle';
import { StatusDot } from '@/components/ui/StatusDot';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { load, Store } from '@tauri-apps/plugin-store';

export function AIEngineTab() {
  const [store, setStore] = useState<Store | null>(null);
  
  const [useDefault, setUseDefault] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  
  const [engineConnected, setEngineConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(true);
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function initStore() {
      const s = await load('settings.json', { autoSave: false });
      setStore(s);
      
      const savedUseDefault = await s.get('useDefault');
      if (savedUseDefault !== null) setUseDefault(savedUseDefault as boolean);
      
      const savedModel = await s.get('selectedModel');
      if (savedModel !== null) setSelectedModel(savedModel as string);
    }
    initStore();
    
    // Initial connection test
    handleTestConnection();
  }, []);

  // Listen for sidecar output
  useEffect(() => {
    let unlisten: () => void;
    const setup = async () => {
      unlisten = await listen<{ line: string }>('engine-log', (event) => {
        setLogLines((prev) => {
          const next = [...prev, event.payload.line];
          return next.length > 200 ? next.slice(-200) : next;
        });
      });
    };
    setup();
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logLines]);

  const handleUseDefaultChange = async (val: boolean) => {
    setUseDefault(val);
    if (store) {
      await store.set('useDefault', val);
      await store.save();
    }
  };

  const handleSelectModel = async () => {
    try {
      const selected = await invoke<string | null>('pick_model_folder');
      if (selected) {
        setSelectedModel(selected);
        if (store) {
          await store.set('selectedModel', selected);
          await store.save();
        }
      }
    } catch (e) {
      console.error('[Terra] Failed to pick folder:', e);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const success = await invoke<boolean>('test_connection');
      setEngineConnected(success);
    } catch (e) {
      console.error('[Terra] Connection test failed:', e);
      setEngineConnected(false);
    } finally {
      setIsTesting(false);
    }
  };

  const handleRestart = async () => {
    setIsRestarting(true);
    setEngineConnected(false);
    try {
      await invoke('restart_engine', {
        useDefault,
        modelPath: selectedModel,
      });
      
      // Poll for connection every 3s for up to 90s (model loading is slow)
      const MAX_ATTEMPTS = 30;
      const INTERVAL_MS = 3000;
      
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await new Promise((r) => setTimeout(r, INTERVAL_MS));
        try {
          const success = await invoke<boolean>('test_connection');
          if (success) {
            setEngineConnected(true);
            setIsRestarting(false);
            return;
          }
        } catch {
          // Server not ready yet, keep trying
        }
      }
      
      // Gave up after 90s
      console.error('[Terra] Engine did not start after 90s');
      setEngineConnected(false);
    } catch (e) {
      console.error('[Terra] Failed to restart engine:', e);
    } finally {
      setIsRestarting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Default Model Toggle */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              Model Configuration
            </h3>
            <p className="text-xs text-text-tertiary mt-1">
              Choose between the default bundled model or load a custom local
              model.
            </p>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-surface-primary/50 border border-border-subtle">
          <Toggle
            enabled={useDefault}
            onChange={handleUseDefaultChange}
            label="Use Default Model"
            description="Colibrì GLM-5.2 Engine"
          />

          {useDefault && (
            <div className="mt-3 ml-14 space-y-1.5">
              <div className="flex items-center gap-2">
                <Zap className="size-3 text-accent-400" />
                <span className="text-xs text-text-secondary">
                  Optimized for legal & financial document analysis
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Cpu className="size-3 text-accent-400" />
                <span className="text-xs text-text-secondary">
                  Direct-from-NVMe Streaming · Apple Silicon optimized
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom Model Section */}
      {!useDefault && (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-text-primary mb-1">
              Advanced: Custom Local Model
            </h4>
            <p className="text-xs text-text-tertiary">
              Select a pre-converted Colibrì GLM-5.2 model directory.
            </p>
          </div>

          {/* File Picker */}
          <button
            type="button"
            onClick={handleSelectModel}
            className={`
              w-full flex flex-col items-center justify-center gap-2
              py-6 rounded-lg border-2 border-dashed
              transition-colors duration-150 cursor-pointer bg-transparent
              ${selectedModel
                ? 'border-accent-600/30 bg-accent-600/5'
                : 'border-border-default hover:border-accent-600/40 hover:bg-accent-600/5'
              }
            `}
          >
            <Upload className={`size-5 ${selectedModel ? 'text-accent-400' : 'text-text-tertiary'}`} />
            {selectedModel ? (
              <div className="text-center">
                <div className="text-sm font-medium text-text-primary">
                  Model loaded
                </div>
                <div className="text-xs text-text-tertiary mt-0.5 font-mono break-all px-4">
                  {selectedModel}
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-sm text-text-secondary">
                  Select Colibrì Model Directory
                </div>
                <div className="text-xs text-text-tertiary mt-0.5">
                  Click to browse your local filesystem
                </div>
              </div>
            )}
          </button>
        </div>
      )}

      {/* Engine Status */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-text-primary">
          Engine Status
        </h4>
        <div className="flex items-center justify-between p-3 rounded-lg bg-surface-primary/50 border border-border-subtle">
          <div className="flex items-center gap-2.5">
            <StatusDot
              status={engineConnected ? 'success' : isRestarting ? 'warning' : 'error'}
              pulse={engineConnected || isRestarting}
              size="md"
            />
            <div>
              <div className="text-sm text-text-primary">
                {engineConnected
                  ? 'Connected to localhost:14205'
                  : isRestarting
                  ? 'Starting engine...'
                  : 'Engine not running'}
              </div>
              <div className="text-xs text-text-tertiary">
                {engineConnected
                  ? 'Terra Inference Engine · Ready'
                  : isRestarting
                  ? 'Loading model weights — this may take a minute'
                  : 'Start the local inference engine to begin'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || isRestarting}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-surface-tertiary/50 text-text-secondary hover:text-text-primary hover:bg-surface-tertiary transition-colors cursor-pointer border border-border-subtle disabled:opacity-50"
            >
              <RotateCw className={`size-3 ${isTesting ? 'animate-spin' : ''}`} />
              Test
            </button>
            <button
              type="button"
              onClick={handleRestart}
              disabled={isRestarting}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-accent-600 text-white hover:bg-accent-700 transition-colors cursor-pointer border border-accent-700 disabled:opacity-50"
            >
              <Play className={`size-3 ${isRestarting ? 'animate-pulse' : ''}`} />
              {isRestarting ? 'Starting...' : 'Apply & Restart'}
            </button>
          </div>
        </div>

        {/* Engine Log Console */}
        <div className="flex items-center justify-between mt-2">
          <button
            type="button"
            onClick={() => setShowLogs((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer bg-transparent border-none p-0"
          >
            <Terminal className="size-3" />
            {showLogs ? 'Hide' : 'Show'} engine output
            {logLines.length > 0 && (
              <span className="text-[10px] text-text-tertiary/60">({logLines.length} lines)</span>
            )}
          </button>
          {showLogs && logLines.length > 0 && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(logLines.join('\n'));
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer bg-transparent border-none p-0"
            >
              {copied ? <Check className="size-3 text-green-400" /> : <Copy className="size-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>

        {showLogs && (
          <div className="mt-2 rounded-lg bg-[#0d1117] border border-border-subtle overflow-hidden">
            <div className="max-h-40 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed text-[#8b949e] scrollbar-thin">
              {logLines.length === 0 ? (
                <span className="text-text-tertiary/40 italic">No engine output yet...</span>
              ) : (
                logLines.map((line, i) => (
                  <div key={i} className={line.includes('error') || line.includes('Error') || line.includes('exited') ? 'text-red-400' : line.includes('ready') || line.includes('Running') || line.includes('Serving') ? 'text-green-400' : ''}>
                    {line}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
