import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { CommandPalette } from '@/components/CommandPalette';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { ModelSetupModal } from '@/components/ModelSetupModal';
import type { ModelStatusInfo } from '@/types';

function App() {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isModelSetupOpen, setIsModelSetupOpen] = useState(false);

  // Check on boot if a model is present; if not, open initial setup modal
  useEffect(() => {
    invoke<ModelStatusInfo>('check_model_status')
      .then((status) => {
        if (!status.hasModel) {
          setIsModelSetupOpen(true);
        }
      })
      .catch((err) => {
        console.error('[Terra] Failed to check model status:', err);
      });
  }, []);

  const handleKeyDown = useCallback(
    (e: globalThis.KeyboardEvent) => {
      // Cmd+K or Ctrl+K → Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }

      // Cmd+, or Ctrl+, → Settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
      }
    },
    []
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <Dashboard onOpenSettings={() => setIsSettingsOpen(true)} />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onOpenModelSetup={() => setIsModelSetupOpen(true)}
      />

      <ModelSetupModal
        isOpen={isModelSetupOpen}
        onClose={() => setIsModelSetupOpen(false)}
        isMandatory={false}
      />
    </>
  );
}

export default App;
