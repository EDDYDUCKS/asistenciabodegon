'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MarcajeKioscoResponse, TipoEventoType } from '@/lib/types';
import { marcarAsistenciaKiosco, syncBatchAsistencias } from '@/lib/api-client';
import {
  Clock,
  Camera,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Utensils,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';

interface RecentScan {
  id: string;
  nombre: string;
  tipo: string;
  hora: string;
  exitoso: boolean;
}

export default function KioscoPage() {
  const router = useRouter();
  const [timeStr, setTimeStr] = useState<string>('');
  const [dateStr, setDateStr] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState<MarcajeKioscoResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState<string>('');
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Estados de marcajes recientes para feedback visual inmediato en panel lateral
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);

  // Estados offline
  const [offlineCount, setOfflineCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Lock síncrono para evitar múltiples lecturas concurrentes del lector QR / cámara
  const lockRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Reloj en Tiempo Real (Nicaragua UTC-6) ──────────────────────────────
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const optionsTime: Intl.DateTimeFormatOptions = {
        timeZone: 'America/Managua',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      };
      const optionsDate: Intl.DateTimeFormatOptions = {
        timeZone: 'America/Managua',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      };
      setTimeStr(new Intl.DateTimeFormat('es-NI', optionsTime).format(now));
      setDateStr(new Intl.DateTimeFormat('es-NI', optionsDate).format(now));
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Capturar Fotografía Instantánea ────────────────────────────────────
  const capturePhotoBlob = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const video = document.querySelector('#qr-reader-kiosk video') as HTMLVideoElement | null;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        resolve(null);
        return;
      }
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        resolve(null);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Soporte para captura en modo espejo del canvas
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Resetear transformaciones del context
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
      } else {
        resolve(null);
      }
    });
  }, []);

  // ── Sonido de Feedback ──────────────────────────────────────────────────
  const playAudioFeedback = (success: boolean) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (success) {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else {
        osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
        osc.frequency.setValueAtTime(164.81, ctx.currentTime + 0.1); // E3
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch {
      // ignore
    }
  };

  // ── IndexedDB Offline Queue Helpers ─────────────────────────────────────
  const checkOfflineQueue = async () => {
    try {
      const { getOfflineMarcajes } = await import('@/lib/indexed-db');
      const queue = await getOfflineMarcajes();
      setOfflineCount(queue.length);
    } catch (e) {
      console.warn(e);
    }
  };

  const syncQueue = async () => {
    if (syncing) return;
    try {
      const { getOfflineMarcajes } = await import('@/lib/indexed-db');
      const queue = await getOfflineMarcajes();
      if (queue.length === 0) return;

      setSyncing(true);
      const res = await syncBatchAsistencias(queue.map((q) => ({
        qr_code_token: q.qr_code_token,
        tipo_evento: q.tipo_evento,
        fecha_hora: q.fecha_hora,
        foto: q.foto,
      })));

      if (res.status === 'ok') {
        const { clearOfflineMarcajes } = await import('@/lib/indexed-db');
        await clearOfflineMarcajes();
        playAudioFeedback(true);
        setOfflineCount(0);
        
        // Agregar los sincronizados al feed
        const nowFormatted = new Date().toLocaleTimeString('es-NI', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'America/Managua',
        });
        setRecentScans((prev) => [
          {
            id: String(Math.random()),
            nombre: `${queue.length} marcajes sincronizados`,
            tipo: 'Lote Offline',
            hora: nowFormatted,
            exitoso: true,
          },
          ...prev.slice(0, 3),
        ]);
      }
    } catch (e) {
      console.warn('Fallo al sincronizar cola offline:', e);
    } finally {
      setSyncing(false);
    }
  };

  const handleOfflineMarcaje = async (token: string, event: string, photoBase64: string, customTime?: string) => {
    try {
      const { addOfflineMarcaje } = await import('@/lib/indexed-db');
      const nowStr = customTime || new Date().toISOString();
      await addOfflineMarcaje({
        qr_code_token: token,
        tipo_evento: event || 'AUTODETECT',
        fecha_hora: nowStr,
        foto: photoBase64 || undefined,
      });

      playAudioFeedback(true);
      setFeedback({
        status: 'ok',
        mensaje: 'Guardado localmente (SIN CONEXIÓN). Se sincronizará automáticamente al recuperar internet.',
      });

      // Agregar marcaje offline al feed local
      const localTimeFormatted = new Date(nowStr).toLocaleTimeString('es-NI', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/Managua',
      });
      setRecentScans((prev) => [
        {
          id: String(Math.random()),
          nombre: `Carnet: ...${token.slice(-6)}`,
          tipo: 'Marcación Offline',
          hora: localTimeFormatted,
          exitoso: true,
        },
        ...prev.slice(0, 3),
      ]);

      checkOfflineQueue();

      setTimeout(() => {
        setFeedback(null);
        setProcessing(false);
        setManualToken('');
        lockRef.current = false;
      }, 4000);
    } catch (e: any) {
      playAudioFeedback(false);
      setErrorMsg('Error al guardar fuera de línea: ' + e.message);
      setTimeout(() => {
        setErrorMsg(null);
        setProcessing(false);
        lockRef.current = false;
      }, 4000);
    }
  };

  // Monitorear conexión
  useEffect(() => {
    checkOfflineQueue();

    const handleOnline = () => {
      syncQueue();
    };

    window.addEventListener('online', handleOnline);

    const interval = setInterval(() => {
      if (navigator.onLine) {
        syncQueue();
      } else {
        checkOfflineQueue();
      }
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      clearInterval(interval);
    };
  }, [syncing]);

  // ── Procesar Marcaje de QR Escaneado ──────────────────────────────────
  const processQrScan = useCallback(
    async (token: string) => {
      if (lockRef.current || !token.trim()) return;
      lockRef.current = true;
      setProcessing(true);
      setErrorMsg(null);
      setFeedback(null);

      try {
        // Esperar 800ms para capturar rostro en vez de tarjeta QR
        await new Promise((resolve) => setTimeout(resolve, 800));

        const photoBlob = await capturePhotoBlob();
        
        let photoBase64 = '';
        if (photoBlob) {
          photoBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(photoBlob);
          });
        }

        if (!navigator.onLine) {
          await handleOfflineMarcaje(token.trim(), '', photoBase64, undefined);
          return;
        }

        try {
          const res = await marcarAsistenciaKiosco({
            qr_token: token.trim(),
            tipo_evento: undefined, // Autodetectar
            fotoFile: photoBlob,
            fecha_hora: undefined,
          });

          playAudioFeedback(true);
          setFeedback(res);

          // Agregar al feed de actividad del Kiosco
          if (res.registro) {
            const localTimeFormatted = new Date(res.registro.fecha_hora).toLocaleTimeString('es-NI', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
              timeZone: 'America/Managua',
            });
            setRecentScans((prev) => [
              {
                id: String(res.registro?.id || Math.random()),
                nombre: `${res.registro?.empleado_detalle.nombre} ${res.registro?.empleado_detalle.apellido}`,
                tipo: res.registro?.tipo_evento_display || 'Asistencia',
                hora: localTimeFormatted,
                exitoso: true,
              },
              ...prev.slice(0, 3),
            ]);
          }

          setTimeout(() => {
            setFeedback(null);
            setProcessing(false);
            setManualToken('');
            lockRef.current = false;
          }, 4000);
        } catch (err: any) {
          if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError') || err.message.includes('network'))) {
            await handleOfflineMarcaje(token.trim(), '', photoBase64, undefined);
          } else {
            playAudioFeedback(false);
            setErrorMsg(err.message || 'Error al procesar el código QR');
            
            // Registrar fallo en feed
            setRecentScans((prev) => [
              {
                id: String(Math.random()),
                nombre: 'Escaneo Fallido',
                tipo: err.message || 'Fallo de validación',
                hora: new Date().toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Managua' }),
                exitoso: false,
              },
              ...prev.slice(0, 3),
            ]);

            setTimeout(() => {
              setErrorMsg(null);
              setProcessing(false);
              lockRef.current = false;
            }, 4000);
          }
        }
      } catch (err: any) {
        playAudioFeedback(false);
        setErrorMsg('Error de cámara o codificación: ' + err.message);
        setProcessing(false);
        lockRef.current = false;
      }
    },
    [capturePhotoBlob]
  );

  // ── Listener de Lector QR USB ─────────────────────────────────────────
  useEffect(() => {
    let buffer = '';
    let timeoutId: NodeJS.Timeout;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key === 'Enter') {
        if (buffer.length > 5) {
          processQrScan(buffer.trim());
        }
        buffer = '';
      } else if (e.key.length === 1) {
        buffer += e.key;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          buffer = '';
        }, 300);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [processQrScan]);

  // ── Escáner de Cámara Html5Qrcode ─────────────────────────────────────
  useEffect(() => {
    let scanner: any = null;
    async function initScanner() {
      try {
        const { Html5QrcodeScanner } = await import('html5-qrcode');
        scanner = new Html5QrcodeScanner(
          'qr-reader-kiosk',
          { fps: 10 },
          false
        );
        scanner.render(
          (decodedText: string) => {
            processQrScan(decodedText);
          },
          () => {
            // Ignorar errores de escaneo
          }
        );
      } catch (e) {
        console.warn('Html5Qrcode scanner failed to render:', e);
      }
    }
    initScanner();
    return () => {
      if (scanner) {
        try {
          scanner.clear();
        } catch {
          // ignore
        }
      }
    };
  }, [processQrScan]);

  return (
    <main className="min-h-screen bg-[#fcf9f5] text-stone-900 flex flex-col justify-between p-4 sm:p-6 select-none font-sans">
      <canvas ref={canvasRef} className="hidden" />

      {/* Banner de Sincronización Offline */}
      {offlineCount > 0 && (
        <div className="bg-amber-600 border-b border-amber-700 text-white font-bold text-xs py-2.5 px-4 text-center animate-pulse flex items-center justify-center gap-2 rounded-2xl mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Tiene {offlineCount} marcaje(s) pendientes de sincronización por falta de conexión.</span>
          <span className="font-normal opacity-90">
            {syncing ? '(Sincronizando...)' : '(Se enviarán automáticamente al restablecerse la red)'}
          </span>
        </div>
      )}

      {/* Header del Kiosco */}
      <header className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-stone-200/80 pb-5 bg-white/70 backdrop-blur-md px-6 py-4 rounded-3xl shadow-premium border border-white/60">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowExitConfirm(true)}
            className="p-2.5 rounded-xl hover:bg-stone-100 border border-stone-200 text-stone-600 transition-all active:scale-95 flex items-center gap-1.5"
            title="Volver al Portal"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-bold hidden sm:inline">Portal</span>
          </button>
          
          <div className="w-10 h-10 rounded-xl bg-[#1c6856] flex items-center justify-center text-white shadow-md shadow-[#1c6856]/10">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-display font-black tracking-tight text-[#1c6856] flex items-center gap-2">
              El Bodegón
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#1c6856]/10 text-[#1c6856]">
                Kiosco
              </span>
            </h1>
            <p className="text-[10px] sm:text-xs text-stone-500 font-medium font-sans">
              Estación de Registro de Asistencia
            </p>
          </div>
        </div>

        {/* Reloj Digital */}
        <div className="text-center md:text-right px-5 py-2 bg-stone-50 border border-stone-200/80 rounded-2xl">
          <div className="text-2xl sm:text-3xl font-black font-mono tracking-wider text-[#1c6856] flex items-center justify-center md:justify-end gap-2">
            <Clock className="w-5 h-5 text-amber-500 animate-pulse shrink-0" />
            {timeStr || '00:00:00 AM'}
          </div>
          <p className="text-[9px] text-stone-400 uppercase font-bold tracking-widest mt-0.5">
            {dateStr || 'Cargando fecha...'}
          </p>
        </div>
      </header>

      {/* Cuerpo Principal - Grid de Doble Columna en Pantallas Grandes */}
      <div className="my-auto py-6 max-w-6xl mx-auto w-full grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
        
        {/* Columna Izquierda: Lector / Escáner */}
        <div className="md:col-span-7 bg-white border border-stone-200/80 rounded-3xl p-6 shadow-kiosk space-y-5 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-[#1c6856]" />
              <h3 className="font-display font-black text-sm text-stone-800">
                Lector de Asistencia
              </h3>
            </div>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Cámara Activa</span>
            </span>
          </div>

          {/* Contenedor del Escáner (Html5Qrcode) */}
          <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-stone-200 bg-stone-950 flex items-center justify-center">
            <div id="qr-reader-kiosk" className="w-full h-full object-cover" />
            
            {/* Custom Scanning Target Frame (CSS-only, beautiful and perfectly centered) */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="w-60 h-60 border border-white/20 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                {/* Esquinas del objetivo */}
                <div className="absolute -top-1.5 -left-1.5 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                <div className="absolute -top-1.5 -right-1.5 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                <div className="absolute -bottom-1.5 -left-1.5 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                <div className="absolute -bottom-1.5 -right-1.5 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
                
                {/* Línea de escaneo láser pulsante */}
                <div className="absolute inset-x-2.5 h-[2px] bg-emerald-400 shadow-[0_0_8px_#34d399] animate-laser" />
              </div>
            </div>
            
            <div className="absolute inset-0 border-2 border-emerald-500/20 rounded-2xl pointer-events-none z-20" />
          </div>

          {/* Estado del Marcaje / Feedback */}
          <div className="min-h-[110px] flex items-center justify-center relative bg-stone-50 border border-stone-200/60 rounded-2xl p-4">
            {processing && !feedback && !errorMsg && (
              <div className="flex flex-col items-center gap-2 text-center animate-pulse">
                <RefreshCw className="w-6 h-6 text-[#1c6856] animate-spin" />
                <p className="text-xs font-bold text-stone-600">
                  Procesando marcaje, por favor espere...
                </p>
              </div>
            )}

            {feedback && (
              <div className="text-center space-y-2.5 animate-in zoom-in-95 duration-200 w-full">
                <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white mx-auto shadow-sm shadow-emerald-500/10">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-display font-black text-sm text-emerald-950">¡Registro Exitoso!</h4>
                  <p className="text-[11px] font-semibold text-emerald-800 mt-0.5">
                    {feedback.mensaje}
                  </p>
                  {feedback.horas_trabajadas_hoy !== undefined && (
                    <span className="inline-block bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-md mt-1.5 font-mono">
                      Horas hoy: {feedback.horas_trabajadas_hoy.toFixed(2)} hrs
                    </span>
                  )}
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="text-center space-y-2.5 animate-in shake duration-200 w-full">
                <div className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center text-white mx-auto shadow-sm shadow-rose-500/10">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-display font-black text-sm text-rose-950">Error al Registrar</h4>
                  <p className="text-[11px] font-semibold text-rose-800 mt-0.5 animate-pulse">
                    {errorMsg}
                  </p>
                </div>
              </div>
            )}

            {!processing && !feedback && !errorMsg && (
              <div className="text-center space-y-1.5 py-2">
                <QrCode className="w-7 h-7 text-[#1c6856]/40 mx-auto animate-bounce" />
                <div>
                  <span className="text-xs font-black text-stone-700 block">
                    Acerque su carnet QR al escáner
                  </span>
                  <span className="text-[10px] text-stone-400 block font-medium">
                    El sistema detectará automáticamente su Entrada, Salida o Pausas.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Ingreso manual */}
          <div className="pt-3 border-t border-stone-100 flex flex-col gap-2">
            <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider font-sans">
              Ingreso manual (Contingencia)
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Introduce el código del carnet..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                disabled={processing}
                className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-xs text-stone-900 focus:outline-none focus:ring-1 focus:ring-[#1c6856] font-mono font-bold"
              />
              <button
                onClick={() => processQrScan(manualToken)}
                disabled={processing || !manualToken.trim()}
                className="bg-[#1c6856] hover:bg-[#154f42] active:scale-95 disabled:opacity-50 text-white px-5 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                Registrar
              </button>
            </div>
          </div>
        </div>

        {/* Columna Derecha: Feed de Actividad Reciente */}
        <div className="md:col-span-5 glass-panel rounded-3xl p-6 shadow-kiosk flex flex-col justify-between border border-white">
          <div className="space-y-4">
            <h3 className="font-display font-black text-sm text-stone-850 border-b border-stone-200/60 pb-3 flex items-center gap-1.5">
              <Clock className="w-4.5 h-4.5 text-[#1c6856]" />
              Actividad Reciente (Hoy)
            </h3>

            {recentScans.length === 0 ? (
              <div className="py-24 text-center text-stone-400 space-y-2 border border-dashed border-stone-200 rounded-2xl bg-white/20">
                <QrCode className="w-10 h-10 mx-auto text-stone-300 opacity-60" />
                <p className="text-xs font-semibold text-stone-400">Sin registros recientes</p>
                <p className="text-[10px] text-stone-400 px-8 font-medium">Los escaneos del día de hoy aparecerán listados aquí para confirmación.</p>
              </div>
            ) : (
              <div className="space-y-2.5 animate-in fade-in duration-300">
                {recentScans.map((scan) => (
                  <div
                    key={scan.id}
                    className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                      scan.exitoso
                        ? 'bg-white border-stone-200/80 shadow-sm'
                        : 'bg-rose-50/50 border-rose-100'
                    }`}
                  >
                    <div>
                      <h4 className="font-bold text-xs text-stone-900 leading-tight">
                        {scan.nombre}
                      </h4>
                      <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full mt-1.5 border ${
                        scan.exitoso
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          : 'bg-rose-50 text-rose-700 border-rose-100'
                      }`}>
                        {scan.tipo}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-stone-500 font-mono font-bold">
                        {scan.hora}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-stone-200/60 text-center">
            <p className="text-[10px] text-stone-400 font-medium">
              Conexión: {navigator.onLine ? '🟢 En línea' : '🟡 Modo sin conexión local'}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-[9px] text-stone-400 uppercase font-bold tracking-wider border-t border-stone-200/60 pt-4 mt-6">
        Restaurante El Bodegón © 2026 — Estación Kiosco Registrada
      </footer>

      {/* DIÁLOGO CONFIRMACIÓN RETORNO PORTAL */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center text-white mx-auto shadow-md shadow-amber-500/10 animate-pulse">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display font-black text-stone-900 text-base">¿Salir del Kiosco?</h3>
              <p className="text-xs text-stone-500 font-medium mt-1.5 leading-relaxed">
                Esta pantalla está diseñada para permanecer abierta en la tablet de la pared. ¿Está seguro que desea salir al portal?
              </p>
            </div>
            <div className="flex gap-2.5 pt-2">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-2.5 rounded-xl text-xs font-bold transition-colors border border-stone-200"
              >
                Permanecer
              </button>
              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  router.push('/');
                }}
                className="flex-1 bg-[#1c6856] hover:bg-[#154f42] text-white py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
