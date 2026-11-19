import { useEffect } from 'react';

// Customer Portal pages use the light palette (index.css, html.portal-light)
// while they're on screen; the rest of 3PhaseApps stays dark.
export default function usePortalLight() {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add('portal-light');
    return () => el.classList.remove('portal-light');
  }, []);
}
