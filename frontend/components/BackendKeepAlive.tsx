'use client';

import { useEffect } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api';

/**
 * Mantiene despierto el contenedor en Render Cloud enviando un latido (ping)
 * ultra-liviano cada 9 minutos mientras haya una pestaña activa del sistema.
 */
export default function BackendKeepAlive() {
  useEffect(() => {
    const pingBackend = async () => {
      try {
        const pingUrl = API_BASE_URL.replace(/\/api\/?$/, '') + '/health/';
        await fetch(pingUrl, { mode: 'no-cors', cache: 'no-store' });
      } catch {
        // Silencioso: si no hay red, no interrumpe la experiencia
      }
    };

    // Ping inmediato al montar
    pingBackend();

    // Ping recurrente cada 9 minutos (540,000 ms)
    const interval = setInterval(pingBackend, 540000);
    return () => clearInterval(interval);
  }, []);

  return null;
}
