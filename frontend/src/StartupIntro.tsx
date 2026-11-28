import { useEffect, type ReactNode } from 'react';

interface StartupIntroProps {
  enabled: boolean;
  children: ReactNode;
}

const STARTUP_DURATION_MS = 3500;
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
      splash.innerHTML = '<span class="startup-orbit startup-orbit-one" aria-hidden="true"></span><span class="startup-orbit startup-orbit-two" aria-hidden="true"></span><div class="startup-wordmark" aria-hidden="true"><img class="startup-logo" src="/logo-horizontal.png" alt="Llévalo"></div>';
      document.body.appendChild(splash);
    }

    const preference = localStorage.getItem('llevalo_theme_preference') || 'system';
    const darkMode = preference === 'dark'
      || (preference !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    splash.classList.toggle('startup-intro-dark', darkMode);
    const startupLogo = splash.querySelector<HTMLImageElement>('.startup-logo');
    if (startupLogo) {
      startupLogo.src = darkMode ? '/logo-horizontal-dark.png' : '/logo-horizontal.png';
    }
    window.location.href = `llevalo://theme/${preference}`;
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
