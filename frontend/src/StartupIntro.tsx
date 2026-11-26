import { useEffect, type ReactNode } from 'react';

interface StartupIntroProps {
  enabled: boolean;
  children: ReactNode;
}

const STARTUP_DURATION_MS = 2700;
const FADE_DURATION_MS = 220;

export function StartupIntro({ enabled, children }: StartupIntroProps) {
  useEffect(() => {
    let splash = document.getElementById('startup-splash');
    if (!enabled) {
      splash?.remove();
      return;
    }
    if (!splash) {
      splash = document.createElement('div');
      splash.id = 'startup-splash';
      splash.className = 'startup-intro';
      splash.setAttribute('role', 'status');
      splash.setAttribute('aria-label', 'Iniciando Llévalo');
      splash.innerHTML = '<span class="startup-orbit startup-orbit-one" aria-hidden="true"></span><span class="startup-orbit startup-orbit-two" aria-hidden="true"></span><div class="startup-wordmark" aria-hidden="true"><span class="startup-initial-wrap"><span class="startup-initial">L</span><span class="startup-santa-hat"><span class="startup-santa-hat-pom"></span><span class="startup-santa-hat-brim"></span></span></span><span class="startup-wordmark-rest">lévalo</span></div><span class="startup-tagline" aria-hidden="true">Hecho para resolver</span>';
      document.body.appendChild(splash);
    }

    const darkMode = localStorage.getItem('llevalo_dark_mode') === 'true';
    splash.classList.toggle('startup-intro-dark', darkMode);
    window.location.href = `llevalo://theme/${darkMode ? 'dark' : 'light'}`;
    const startedAt = Number(document.documentElement.dataset.startupAt);
    const elapsed = Number.isFinite(startedAt) ? performance.now() - startedAt : 0;
    const timeout = window.setTimeout(() => {
      splash.classList.add('startup-intro-hidden');
      window.setTimeout(() => splash.remove(), FADE_DURATION_MS);
    }, Math.max(0, STARTUP_DURATION_MS - elapsed));

    return () => window.clearTimeout(timeout);
  }, [enabled]);

  return children;
}
