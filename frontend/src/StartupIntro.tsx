import { useEffect, useState, type ReactNode } from 'react';

interface StartupIntroProps {
  enabled: boolean;
  children: ReactNode;
}

const STARTUP_DURATION_MS = 2500;
const REDUCED_MOTION_DURATION_MS = 900;

export function StartupIntro({ enabled, children }: StartupIntroProps) {
  const [visible, setVisible] = useState(enabled);
  const [darkMode] = useState(() => localStorage.getItem('llevalo_dark_mode') === 'true');

  useEffect(() => {
    if (!enabled) return;

    window.location.href = `llevalo://theme/${darkMode ? 'dark' : 'light'}`;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeout = window.setTimeout(
      () => setVisible(false),
      reducedMotion ? REDUCED_MOTION_DURATION_MS : STARTUP_DURATION_MS
    );

    return () => window.clearTimeout(timeout);
  }, [enabled, darkMode]);

  return (
    <>
      {children}
      {visible && (
        <div className={`startup-intro ${darkMode ? 'startup-intro-dark' : ''}`} role="status" aria-label="Iniciando Llévalo">
          <div className="startup-wordmark" aria-hidden="true">
            <span className="startup-initial">L</span>
            <span className="startup-wordmark-rest">lévalo</span>
          </div>
        </div>
      )}
    </>
  );
}
