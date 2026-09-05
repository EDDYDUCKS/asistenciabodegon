'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { MarcajeKioscoResponse, TipoEventoType, Empleado } from '@/lib/types';
import { marcarAsistenciaKiosco, consultarHorasKiosco, syncBatchAsistencias, fetchEmpleados } from '@/lib/api-client';
import {
  Clock,
  Camera,
  CheckCircle2,
  AlertCircle,
  QrCode,
  Utensils,
  ArrowLeft,
  RefreshCw,
  Lock,
  KeyRound,
  BarChart3,
  X,
  Star,
  Coffee,
  TrendingUp,
  Sparkles,
  Award,
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
  const [feedbackTimer, setFeedbackTimer] = useState<number>(10);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminPinError, setAdminPinError] = useState(false);
  const [empleadosCache, setEmpleadosCache] = useState<Empleado[]>([]);
  const [empleadoDetectado, setEmpleadoDetectado] = useState<Empleado | null>(null);

  // Estados de Consulta de Horas para Colaboradores
  const [showConsultaModal, setShowConsultaModal] = useState(false);
  const [consultaData, setConsultaData] = useState<any | null>(null);
  const [consultaTimer, setConsultaTimer] = useState(10);
  const [consultando, setConsultando] = useState(false);
  const [consultaError, setConsultaError] = useState<string | null>(null);

  const showConsultaModalRef = useRef(false);
  showConsultaModalRef.current = showConsultaModal;
  const consultaDataRef = useRef<any | null>(null);
  consultaDataRef.current = consultaData;
  const consultandoRef = useRef(false);
  consultandoRef.current = consultando;

  // Estados de marcajes recientes para feedback visual inmediato en panel lateral
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);

  // Estados offline
  const [offlineCount, setOfflineCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Estados de cámara y permisos
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const html5QrCodeRef = useRef<any>(null);

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

    // Precargar lista de empleados para reconocimiento visual instantáneo
    fetchEmpleados()
      .then((list) => setEmpleadosCache(list.filter((e) => e.activo)))
      .catch((e) => console.warn('Error precargando empleados para Kiosco:', e));

    return () => clearInterval(interval);
  }, []);

  // ── Capturar Fotografía Instantánea Ultra-Optimizada (Reducción 95% de Memoria) ──
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

      // Redimensionar proporcionalmente a 320px de ancho (perfecto para ver el rostro consumiendo solo ~15KB)
      const targetWidth = 320;
      const scale = targetWidth / video.videoWidth;
      const targetHeight = Math.round(video.videoHeight * scale);

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Soporte para captura en modo espejo del canvas
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        // Resetear transformaciones del context
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // Compresión 0.60 (Excelente nitidez facial, peso pluma)
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.60);
      } else {
        resolve(null);
      }
    });
  }, []);

  // ── Sonido de Feedback Auditivo Inteligente y Diferenciado ───────────────
  const playAudioFeedback = (
    type:
      | boolean
      | 'success'
      | 'error'
      | 'cooldown'
      | 'ENTRADA'
      | 'SALIDA_QUEBRADA'
      | 'ENTRADA_QUEBRADA'
      | 'SALIDA_DEFINITIVA'
  ) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'ENTRADA') {
        // Acorde mayor ascendente alegre (C5 -> E5 -> G5)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.09); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.18); // G5
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === 'SALIDA_QUEBRADA') {
        // Tono cálido, suave y relajante para inicio de pausa (A4 -> E4)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
        osc.frequency.setValueAtTime(329.63, ctx.currentTime + 0.12); // E4
        gain.gain.setValueAtTime(0.16, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === 'ENTRADA_QUEBRADA') {
        // Doble campana activa / Power-up de retorno (F5 -> A5)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(698.46, ctx.currentTime); // F5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.32);
        osc.start();
        osc.stop(ctx.currentTime + 0.32);
      } else if (type === 'SALIDA_DEFINITIVA') {
        // Acorde triunfal de misión cumplida y fin de jornada (C5 -> G5 -> C6)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.1); // G5
        osc.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.2); // C6
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
      } else if (type === true || type === 'success') {
        // Ding brillante de confirmación
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'cooldown') {
        // Doble campana suave informativa
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else {
        // Tono grave de alerta / error
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

  // ── PIN DE GERENCIA (4512) PARA TÚNEL DIRECTO A ADMINISTRACIÓN ────────────
  const handleAdminPinKeyPress = useCallback((num: string) => {
    setAdminPinError(false);
    setAdminPin((prev) => {
      if (prev.length >= 4) return prev;
      const newPin = prev + num;
      if (newPin === '4512') {
        playAudioFeedback('success');
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('admin_auth_pin_verified', 'true');
        }
        setTimeout(() => {
          setShowAdminPinModal(false);
          setAdminPin('');
          router.push('/admin');
        }, 150);
        return newPin;
      } else if (newPin.length === 4) {
        setTimeout(() => {
          setAdminPinError(true);
          setAdminPin('');
          playAudioFeedback('error');
        }, 200);
      }
      return newPin;
    });
  }, [router]);

  const handleAdminPinBackspace = useCallback(() => {
    setAdminPin((prev) => prev.slice(0, -1));
    setAdminPinError(false);
  }, []);

  // Soporte de teclado físico para el modal de PIN del Kiosco
  useEffect(() => {
    if (!showAdminPinModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleAdminPinKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleAdminPinBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowAdminPinModal(false);
        setAdminPin('');
        setAdminPinError(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAdminPinModal, handleAdminPinKeyPress, handleAdminPinBackspace]);

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

      playAudioFeedback('ENTRADA');
      setFeedback({
        status: 'ok',
        mensaje: 'Guardado localmente (SIN CONEXIÓN). Se sincronizará automáticamente al recuperar internet.',
      });
      setFeedbackTimer(10);

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
    } catch (e: any) {
      playAudioFeedback(false);
      setErrorMsg('Error al guardar fuera de línea: ' + e.message);
      setTimeout(() => {
        setErrorMsg(null);
        setProcessing(false);
        lockRef.current = false;
      }, 5000);
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

  // ── Manejo de Cierre de Consulta de Horas ─────────────────────────────────
  const handleCerrarConsulta = useCallback(() => {
    setShowConsultaModal(false);
    setConsultaData(null);
    setConsultaTimer(10);
    setConsultaError(null);
    setConsultando(false);
    consultandoRef.current = false;
    showConsultaModalRef.current = false;
    consultaDataRef.current = null;
    lockRef.current = false;
  }, []);

  // ── Auto-Cierre de 10 Segundos para Consulta de Horas ─────────────────────
  useEffect(() => {
    if (!consultaData) return;
    if (consultaTimer <= 0) {
      handleCerrarConsulta();
      return;
    }
    const timer = setTimeout(() => {
      setConsultaTimer((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [consultaData, consultaTimer, handleCerrarConsulta]);

  // ── Auto-Cierre de 10 Segundos para el Feedback de Marcaje ────────────────
  useEffect(() => {
    if (!feedback) return;
    if (feedbackTimer <= 0) {
      setFeedback(null);
      setProcessing(false);
      setEmpleadoDetectado(null);
      lockRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setFeedbackTimer((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [feedback, feedbackTimer]);

  // ── Procesar Marcaje de QR Escaneado ──────────────────────────────────
  const processQrScan = useCallback(
    async (token: string) => {
      if (lockRef.current || !token.trim()) return;

      // ── MODO CONSULTA DE HORAS PARA COLABORADORES ──
      if (showConsultaModalRef.current) {
        if (consultaDataRef.current || consultandoRef.current) return;
        lockRef.current = true;
        consultandoRef.current = true;
        setConsultando(true);
        setConsultaError(null);
        try {
          const res = await consultarHorasKiosco(token.trim());
          setConsultaData(res);
          consultaDataRef.current = res;
          setConsultaTimer(10);
          playAudioFeedback('success');
        } catch (err: any) {
          playAudioFeedback(false);
          setConsultaError(err.message || 'Carnet no reconocido. Intente de nuevo.');
          setTimeout(() => {
            setConsultaError(null);
          }, 4000);
        } finally {
          setConsultando(false);
          consultandoRef.current = false;
          lockRef.current = false;
        }
        return;
      }

      // ── MODO MARCAJE NORMAL DE ASISTENCIA ──
      lockRef.current = true;
      setProcessing(true);
      setErrorMsg(null);
      setFeedback(null);

      // 1. Reconocimiento visual instantáneo en el Kiosco
      const rawUuid = token.trim().split('.')[0];
      const matchEmp = empleadosCache.find((e) => e.qr_code_token?.startsWith(rawUuid));
      if (matchEmp) {
        setEmpleadoDetectado(matchEmp);
      }

      try {
        // 2. Esperar 2.0 segundos: El trabajador lee su nombre y mira de frente a la pantalla
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // 3. Capturar fotografía con el rostro despejado
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

          if (res.status === 'cooldown') {
            playAudioFeedback('cooldown');
          } else {
            const ev = res.registro?.tipo_evento;
            if (ev && ['ENTRADA', 'SALIDA_QUEBRADA', 'ENTRADA_QUEBRADA', 'SALIDA_DEFINITIVA'].includes(ev)) {
              playAudioFeedback(ev as any);
            } else {
              playAudioFeedback('success');
            }
          }
          setFeedback(res);
          setFeedbackTimer(10);
          setEmpleadoDetectado(null);

          // Agregar al feed de actividad del Kiosco
          if (res.registro && res.status !== 'cooldown') {
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
        } catch (err: any) {
          setEmpleadoDetectado(null);
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
              setEmpleadoDetectado(null);
              lockRef.current = false;
            }, 5000);
          }
        }
      } catch (err: any) {
        setEmpleadoDetectado(null);
        playAudioFeedback(false);
        setErrorMsg('Error capturando fotografía: ' + err.message);
        setTimeout(() => {
          setErrorMsg(null);
          setProcessing(false);
          setEmpleadoDetectado(null);
          lockRef.current = false;
        }, 5000);
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

  // ── Escáner de Cámara Directo con Html5Qrcode ─────────────────────────
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const { Html5Qrcode } = await import('html5-qrcode');

      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            await html5QrCodeRef.current.stop();
          }
        } catch {}
      }

      const scanner = new Html5Qrcode('qr-reader-kiosk');
      html5QrCodeRef.current = scanner;

      const qrConfig = { fps: 15, qrbox: { width: 250, height: 250 } };

      try {
        // Intentar primero con cámara frontal (tablet/laptop)
        await scanner.start(
          { facingMode: 'user' },
          qrConfig,
          (decodedText: string) => processQrScan(decodedText),
          () => {}
        );
        setCameraActive(true);
      } catch (errUser) {
        // Fallback a cámara trasera o predeterminada
        await scanner.start(
          { facingMode: 'environment' },
          qrConfig,
          (decodedText: string) => processQrScan(decodedText),
          () => {}
        );
        setCameraActive(true);
      }
    } catch (err: any) {
      console.warn('Error inicializando cámara:', err);
      setCameraActive(false);
      const isDenied = err?.name === 'NotAllowedError' || err?.message?.toLowerCase().includes('permission') || err?.message?.toLowerCase().includes('denied');
      setCameraError(
        isDenied
          ? 'El navegador no tiene permiso para usar la cámara. Haga clic en "Activar Cámara" y seleccione "Permitir" cuando el navegador lo solicite.'
          : 'No se pudo acceder a la cámara del dispositivo. Verifique que no esté en uso por otra pestaña o app.'
      );
    }
  }, [processQrScan]);

  useEffect(() => {
    startCamera();
    return () => {
      if (html5QrCodeRef.current) {
        try {
          if (html5QrCodeRef.current.isScanning) {
            html5QrCodeRef.current.stop();
          }
        } catch {}
      }
    };
  }, [startCamera]);

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
            onClick={() => {
              setShowAdminPinModal(true);
              setAdminPin('');
              setAdminPinError(false);
            }}
            className="p-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-600 hover:text-stone-900 transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
            title="Acceso Administrativo"
          >
            <Lock className="w-4 h-4 text-[#1c6856]" />
            <span className="text-xs font-bold text-[#1c6856] hidden sm:inline">Admin</span>
          </button>
          
          <div className="w-10 h-10 rounded-xl bg-[#1c6856] flex items-center justify-center text-white shadow-md shadow-[#1c6856]/10">
            <Utensils className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-display font-black tracking-tight text-[#1c6856] flex items-center gap-2">
              BodegónPass
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#1c6856]/10 text-[#1c6856]">
                Kiosco
              </span>
            </h1>
            <p className="text-[10px] sm:text-xs text-stone-500 font-medium font-sans">
              Restaurante El Bodegón — Estación de Asistencia
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
              <span className={`w-2.5 h-2.5 rounded-full ${cameraActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">
                {cameraActive ? 'Cámara Activa' : 'Cámara Inactiva'}
              </span>
            </span>
          </div>

          {/* Contenedor del Escáner (Html5Qrcode) */}
          <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-stone-200 bg-stone-950 flex flex-col items-center justify-center">
            <div id="qr-reader-kiosk" className="w-full h-full object-cover" />
            
            {/* Pantalla de Permisos / Activación de Cámara */}
            {!cameraActive && (
              <div className="absolute inset-0 bg-stone-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-white text-center space-y-3 z-30">
                <div className="w-12 h-12 rounded-2xl bg-[#1c6856] flex items-center justify-center text-white shadow-lg mx-auto">
                  <Camera className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">Cámara del Kiosco</h4>
                  <p className="text-xs text-stone-300 max-w-xs mt-1">
                    {cameraError || 'Haga clic para activar la cámara y permitir el escaneo de carnets QR.'}
                  </p>
                </div>
                <button
                  onClick={startCamera}
                  className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Activar Cámara / Otorgar Permisos
                </button>
              </div>
            )}

            {/* Custom Scanning Target Frame (CSS-only, activo cuando hay video) */}
            {cameraActive && !processing && !feedback && !errorMsg && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className={`w-60 h-60 border rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] transition-all ${
                  showConsultaModal ? 'border-teal-400' : 'border-white/20'
                }`}>
                  {/* Esquinas del objetivo */}
                  <div className={`absolute -top-1.5 -left-1.5 w-8 h-8 border-t-4 border-l-4 rounded-tl-lg transition-colors ${
                    showConsultaModal ? 'border-teal-300' : 'border-emerald-400'
                  }`} />
                  <div className={`absolute -top-1.5 -right-1.5 w-8 h-8 border-t-4 border-r-4 rounded-tr-lg transition-colors ${
                    showConsultaModal ? 'border-teal-300' : 'border-emerald-400'
                  }`} />
                  <div className={`absolute -bottom-1.5 -left-1.5 w-8 h-8 border-b-4 border-l-4 rounded-bl-lg transition-colors ${
                    showConsultaModal ? 'border-teal-300' : 'border-emerald-400'
                  }`} />
                  <div className={`absolute -bottom-1.5 -right-1.5 w-8 h-8 border-b-4 border-r-4 rounded-br-lg transition-colors ${
                    showConsultaModal ? 'border-teal-300' : 'border-emerald-400'
                  }`} />
                  
                  {/* Línea de escaneo láser pulsante */}
                  <div className={`absolute inset-x-2.5 h-[2px] shadow-[0_0_8px] animate-laser ${
                    showConsultaModal ? 'bg-teal-300 shadow-teal-300' : 'bg-emerald-400 shadow-[#34d399]'
                  }`} />
                </div>
              </div>
            )}

            {/* ── OVERLAY CENTRAL DE ALTA VISIBILIDAD (MÓVIL & PC) ── */}
            {processing && !feedback && !errorMsg && (
              <div className="absolute inset-0 bg-stone-950/85 backdrop-blur-md z-30 flex flex-col items-center justify-center p-4 text-center animate-in fade-in duration-150">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-300 mx-auto shadow-lg mb-2 animate-pulse">
                  <Camera className="w-7 h-7" />
                </div>
                {empleadoDetectado ? (
                  <div className="space-y-1">
                    <h2 className="text-xl sm:text-2xl font-display font-black text-white tracking-tight drop-shadow-md">
                      ¡Hola {empleadoDetectado.nombre}!
                    </h2>
                    <p className="text-xs sm:text-sm font-bold text-emerald-300 drop-shadow flex items-center justify-center gap-1.5">
                      <span>📸</span> Mire de frente a la pantalla para su foto...
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <h2 className="text-xl sm:text-2xl font-display font-black text-white tracking-tight drop-shadow-md">
                      ¡Carnet Reconocido!
                    </h2>
                    <p className="text-xs sm:text-sm font-bold text-emerald-300 drop-shadow flex items-center justify-center gap-1.5">
                      <span>📸</span> Mire de frente a la pantalla para su foto...
                    </p>
                  </div>
                )}
              </div>
            )}

            {feedback && (
              <div className="absolute inset-0 bg-stone-950/95 backdrop-blur-md z-30 flex flex-col items-center justify-center p-4 sm:p-6 text-center animate-in zoom-in-95 duration-200">
                {feedback.status === 'cooldown' ? (
                  <div className="space-y-2.5 max-w-sm sm:max-w-md mx-auto">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-500 border-2 border-amber-300 flex items-center justify-center text-white mx-auto shadow-xl">
                      <Clock className="w-6 h-6 sm:w-7 sm:h-7" />
                    </div>
                    {feedback.registro?.empleado_detalle && (
                      <h2 className="text-lg sm:text-2xl font-display font-black text-white tracking-tight leading-tight">
                        {feedback.registro.empleado_detalle.nombre} {feedback.registro.empleado_detalle.apellido}
                      </h2>
                    )}
                    <span className="inline-block px-3 py-0.5 rounded-full bg-amber-500/25 border border-amber-400 text-amber-300 text-[11px] sm:text-xs font-bold uppercase tracking-wider">
                      Marcaje Previo Guardado
                    </span>
                    <p className="text-xs sm:text-sm font-medium text-stone-200 leading-snug">
                      {feedback.mensaje}
                    </p>
                    {feedback.horas_trabajadas_hoy !== undefined && (
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <span className="inline-block bg-white/10 border border-white/20 text-white text-xs sm:text-sm font-bold px-3 py-1 rounded-xl font-mono">
                          ⏱️ Horas Hoy: {feedback.horas_trabajadas_hoy.toFixed(2)} hrs
                        </span>
                        {feedback.cumplio_meta_8h ? (
                          <span className="inline-block bg-emerald-500 text-white text-xs sm:text-sm font-bold px-3 py-1 rounded-xl shadow-sm">
                            🎉 Meta de 8h Cumplida
                          </span>
                        ) : feedback.horas_restantes_hoy !== undefined && feedback.horas_restantes_hoy > 0 ? (
                          <span className="inline-block bg-amber-400 text-stone-950 text-xs sm:text-sm font-bold px-3 py-1 rounded-xl font-mono">
                            Faltan: {feedback.horas_restantes_hoy.toFixed(1)} hrs
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : (
                  (() => {
                    const tipo = feedback.registro?.tipo_evento;
                    const empNombre = feedback.registro?.empleado_detalle
                      ? `${feedback.registro.empleado_detalle.nombre} ${feedback.registro.empleado_detalle.apellido}`
                      : 'Colaborador';
                    const horaMarcada = feedback.registro?.fecha_hora
                      ? new Date(feedback.registro.fecha_hora).toLocaleTimeString('es-NI', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                          timeZone: 'America/Managua',
                        })
                      : '';

                    if (tipo === 'ENTRADA') {
                      return (
                        <div className="space-y-3 max-w-sm sm:max-w-md mx-auto animate-in zoom-in-95">
                          <div className="w-14 h-14 rounded-2xl bg-emerald-500 border-2 border-emerald-300 flex items-center justify-center text-white mx-auto shadow-xl shadow-emerald-950/50">
                            <CheckCircle2 className="w-8 h-8" />
                          </div>
                          <div>
                            <span className="inline-block px-3 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400 text-emerald-300 text-[11px] sm:text-xs font-black uppercase tracking-wider mb-1">
                              ENTRADA AL TURNO 🟢
                            </span>
                            <h2 className="text-xl sm:text-2xl font-display font-black text-white tracking-tight">
                              ¡Bienvenido/a, {empNombre}! 👋
                            </h2>
                            <p className="text-xs sm:text-sm font-medium text-emerald-100 mt-0.5">
                              Marcaje registrado a las <strong>{horaMarcada}</strong>
                            </p>
                          </div>
                          <p className="text-xs text-stone-300 bg-white/10 p-2 rounded-xl border border-white/10">
                            ¡Que tengas una jornada productiva y un excelente servicio en El Bodegón!
                          </p>
                          <div className="flex justify-center gap-2 pt-0.5">
                            <span className="bg-emerald-600/60 text-white font-mono text-xs px-3 py-1 rounded-xl border border-emerald-400/40">
                              ⏱️ Meta Diaria: 8.0 horas
                            </span>
                          </div>
                        </div>
                      );
                    }

                    if (tipo === 'SALIDA_QUEBRADA') {
                      const hHoy = feedback.horas_trabajadas_hoy || 0;
                      // Lógica de retorno El Bodegón:
                      const horaRet = hHoy >= 3.8 ? '7:00 PM' : hHoy >= 3.2 ? '6:30 PM' : '6:00 PM';
                      const faltan = Math.max(0, 8.0 - hHoy);

                      return (
                        <div className="space-y-3 max-w-sm sm:max-w-md mx-auto animate-in zoom-in-95">
                          <div className="w-14 h-14 rounded-2xl bg-amber-500 border-2 border-amber-300 flex items-center justify-center text-white mx-auto shadow-xl shadow-amber-950/50">
                            <Coffee className="w-8 h-8" />
                          </div>
                          <div>
                            <span className="inline-block px-3 py-0.5 rounded-full bg-amber-500/25 border border-amber-400 text-amber-300 text-[11px] sm:text-xs font-black uppercase tracking-wider mb-1">
                              SALIDA A PAUSA (TURNO QUEBRADO) ☕
                            </span>
                            <h2 className="text-xl sm:text-2xl font-display font-black text-white tracking-tight">
                              ¡Buen descanso, {empNombre}! 🍽️
                            </h2>
                            <p className="text-xs sm:text-sm font-medium text-amber-100 mt-0.5">
                              Salida a pausa: <strong>{horaMarcada}</strong> • Acumulaste <strong>{hHoy.toFixed(2)} hrs</strong>
                            </p>
                          </div>

                          {/* Tarjeta Destacada de Retorno */}
                          <div className="bg-amber-500/20 border border-amber-300/40 rounded-2xl p-3 text-left space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-amber-300 uppercase tracking-wider">
                                🕒 Tu Hora Límite de Regreso:
                              </span>
                              <span className="text-sm font-black font-mono text-white bg-amber-600 px-2.5 py-0.5 rounded-lg border border-amber-300/60">
                                {horaRet}
                              </span>
                            </div>
                            <p className="text-[11px] text-amber-100 font-medium leading-snug">
                              Debes regresar a las <strong>{horaRet}</strong> para completar tus <strong>{faltan.toFixed(1)}h restantes</strong> antes del cierre de las 11:00 PM.
                            </p>
                          </div>
                        </div>
                      );
                    }

                    if (tipo === 'ENTRADA_QUEBRADA') {
                      return (
                        <div className="space-y-3 max-w-sm sm:max-w-md mx-auto animate-in zoom-in-95">
                          <div className="w-14 h-14 rounded-2xl bg-blue-500 border-2 border-blue-300 flex items-center justify-center text-white mx-auto shadow-xl shadow-blue-950/50">
                            <TrendingUp className="w-8 h-8" />
                          </div>
                          <div>
                            <span className="inline-block px-3 py-0.5 rounded-full bg-blue-500/25 border border-blue-400 text-blue-300 text-[11px] sm:text-xs font-black uppercase tracking-wider mb-1">
                              RETORNO DE PAUSA (2DO BLOQUE) ⚡
                            </span>
                            <h2 className="text-xl sm:text-2xl font-display font-black text-white tracking-tight">
                              ¡De vuelta al turno, {empNombre}! 💪
                            </h2>
                            <p className="text-xs sm:text-sm font-medium text-blue-100 mt-0.5">
                              Retorno registrado a las <strong>{horaMarcada}</strong>
                            </p>
                          </div>
                          <div className="bg-blue-500/20 border border-blue-300/40 rounded-2xl p-3 text-left space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-blue-300 uppercase tracking-wider">
                                Horas restantes para 8h:
                              </span>
                              <span className="text-sm font-black font-mono text-white bg-blue-600 px-2 py-0.5 rounded-lg border border-blue-300/60">
                                {feedback.horas_restantes_hoy !== undefined ? `${feedback.horas_restantes_hoy.toFixed(1)} hrs` : '--'}
                              </span>
                            </div>
                            <p className="text-[11px] text-blue-100 font-medium leading-snug">
                              Llevas {feedback.horas_trabajadas_hoy?.toFixed(2)}h acumuladas. Salida programada al cierre de las 11:00 PM.
                            </p>
                          </div>
                        </div>
                      );
                    }

                    // SALIDA_DEFINITIVA o por defecto
                    const totalH = feedback.horas_trabajadas_hoy || 0;
                    return (
                      <div className="space-y-3 max-w-sm sm:max-w-md mx-auto animate-in zoom-in-95">
                        <div className="w-14 h-14 rounded-2xl bg-purple-600 border-2 border-purple-300 flex items-center justify-center text-white mx-auto shadow-xl shadow-purple-950/50">
                          <Award className="w-8 h-8" />
                        </div>
                        <div>
                          <span className="inline-block px-3 py-0.5 rounded-full bg-purple-500/25 border border-purple-400 text-purple-300 text-[11px] sm:text-xs font-black uppercase tracking-wider mb-1">
                            SALIDA DEFINITIVA - FIN DE JORNADA 🏁
                          </span>
                          <h2 className="text-xl sm:text-2xl font-display font-black text-white tracking-tight">
                            ¡Misión cumplida, {empNombre}! 🎉
                          </h2>
                          <p className="text-xs sm:text-sm font-medium text-purple-100 mt-0.5">
                            Salida registrada a las <strong>{horaMarcada}</strong>
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
                          <span className="bg-white/15 border border-white/20 text-white text-xs sm:text-sm font-bold px-3 py-1 rounded-xl font-mono">
                            ⏱️ Total Hoy: {totalH.toFixed(2)} hrs
                          </span>
                          {feedback.cumplio_meta_8h && (
                            <span className="bg-emerald-500 text-white text-xs sm:text-sm font-bold px-3 py-1 rounded-xl shadow-sm">
                              ✅ Meta 8h Cumplida
                            </span>
                          )}
                          {totalH > 8.0 && (
                            <span className="bg-amber-400 text-stone-950 text-xs sm:text-sm font-black px-3 py-1 rounded-xl">
                              ⭐ +{(totalH - 8.0).toFixed(2)}h extra registradas
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()
                )}

                {/* Barra de progreso de 10 segundos con botón para cerrar */}
                <div className="w-full max-w-sm sm:max-w-md mx-auto pt-3 flex items-center justify-between gap-3">
                  <div className="flex-1 bg-white/20 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-white h-full transition-all duration-1000 ease-linear rounded-full"
                      style={{ width: `${(feedbackTimer / 10) * 100}%` }}
                    />
                  </div>
                  <button
                    onClick={() => {
                      setFeedback(null);
                      setProcessing(false);
                      setEmpleadoDetectado(null);
                      lockRef.current = false;
                    }}
                    className="text-[11px] font-bold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    Listo ({feedbackTimer}s) ✕
                  </button>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="absolute inset-0 bg-stone-950/90 backdrop-blur-md z-30 flex flex-col items-center justify-center p-4 sm:p-6 text-center animate-in zoom-in-95 duration-200">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-rose-500 border-2 border-rose-300 flex items-center justify-center text-white mx-auto shadow-xl mb-2">
                  <AlertCircle className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>
                <h3 className="text-base sm:text-xl font-display font-black text-white">
                  Escaneo No Válido
                </h3>
                <p className="text-xs sm:text-sm text-rose-300 max-w-sm mt-1">
                  {errorMsg}
                </p>
              </div>
            )}
            
            <div className="absolute inset-0 border-2 border-emerald-500/20 rounded-2xl pointer-events-none z-20" />
          </div>

          {/* Estado del Marcaje / Feedback */}
          <div className="min-h-[110px] flex items-center justify-center relative bg-stone-50 border border-stone-200/60 rounded-2xl p-4">
            {processing && !feedback && !errorMsg && (
              <div className="flex flex-col items-center gap-2 text-center animate-in zoom-in-95 duration-200 w-full py-1">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 mx-auto shadow-sm">
                  <Camera className="w-5 h-5 animate-pulse" />
                </div>
                {empleadoDetectado ? (
                  <div>
                    <h3 className="font-display font-black text-base text-stone-900 leading-tight">
                      ¡Hola {empleadoDetectado.nombre} {empleadoDetectado.apellido}!
                    </h3>
                    <p className="text-xs font-bold text-emerald-700 mt-1 flex items-center justify-center gap-1.5 animate-pulse">
                      <span>📸</span> Mire a la pantalla para su foto de asistencia...
                    </p>
                  </div>
                ) : (
                  <div>
                    <h3 className="font-display font-black text-sm text-stone-900 leading-tight">
                      ¡Carnet Reconocido!
                    </h3>
                    <p className="text-xs font-bold text-emerald-700 mt-1 flex items-center justify-center gap-1.5 animate-pulse">
                      <span>📸</span> Mire a la pantalla para su foto de asistencia...
                    </p>
                  </div>
                )}
              </div>
            )}

            {feedback && (
              <div className="text-center space-y-2.5 animate-in zoom-in-95 duration-200 w-full">
                {feedback.status === 'cooldown' ? (
                  <>
                    <div className="w-11 h-11 rounded-2xl bg-amber-500 flex items-center justify-center text-white mx-auto shadow-md shadow-amber-500/20">
                      <Clock className="w-6 h-6" />
                    </div>
                    <div>
                      {feedback.registro?.empleado_detalle && (
                        <h3 className="font-display font-black text-base text-stone-900 mb-0.5">
                          {feedback.registro.empleado_detalle.nombre} {feedback.registro.empleado_detalle.apellido}
                        </h3>
                      )}
                      <h4 className="font-bold text-xs text-amber-800 uppercase tracking-wide">Marcaje Previo Guardado</h4>
                      <p className="text-xs font-medium text-stone-600 mt-1 max-w-md mx-auto">
                        {feedback.mensaje}
                      </p>
                      {feedback.horas_trabajadas_hoy !== undefined && (
                        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                          <span className="inline-block bg-amber-100 text-amber-900 text-[11px] font-bold px-3 py-1 rounded-lg font-mono">
                            ⏱️ Horas Hoy: {feedback.horas_trabajadas_hoy.toFixed(2)} hrs
                          </span>
                          {feedback.cumplio_meta_8h ? (
                            <span className="inline-block bg-emerald-600 text-white text-[11px] font-bold px-3 py-1 rounded-lg">
                              🎉 Meta de 8h Cumplida
                            </span>
                          ) : feedback.horas_restantes_hoy !== undefined && feedback.horas_restantes_hoy > 0 ? (
                            <span className="inline-block bg-stone-100 text-stone-700 text-[11px] font-bold px-3 py-1 rounded-lg">
                              Faltan: {feedback.horas_restantes_hoy.toFixed(1)} hrs
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-11 h-11 rounded-2xl bg-emerald-500 flex items-center justify-center text-white mx-auto shadow-md shadow-emerald-500/20">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      {feedback.registro?.empleado_detalle && (
                        <h3 className="font-display font-black text-base text-stone-900 mb-0.5">
                          {feedback.registro.empleado_detalle.nombre} {feedback.registro.empleado_detalle.apellido}
                        </h3>
                      )}
                      <h4 className="font-bold text-xs text-emerald-800 uppercase tracking-wide">¡Registro Exitoso!</h4>
                      <p className="text-xs font-medium text-stone-600 mt-1">
                        {feedback.mensaje}
                      </p>
                      {feedback.horas_trabajadas_hoy !== undefined && (
                        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                          <span className="inline-block bg-emerald-100 text-emerald-800 text-[11px] font-bold px-3 py-1 rounded-lg font-mono">
                            ⏱️ Horas Hoy: {feedback.horas_trabajadas_hoy.toFixed(2)} hrs
                          </span>
                          {feedback.cumplio_meta_8h ? (
                            <span className="inline-block bg-emerald-600 text-white text-[11px] font-bold px-3 py-1 rounded-lg">
                              🎉 Meta de 8h Cumplida
                            </span>
                          ) : feedback.horas_restantes_hoy !== undefined && feedback.horas_restantes_hoy > 0 ? (
                            <span className="inline-block bg-amber-100 text-amber-900 text-[11px] font-bold px-3 py-1 rounded-lg">
                              Faltan: {feedback.horas_restantes_hoy.toFixed(1)} hrs
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </>
                )}
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

            {/* Estado y Banner en Modo Consulta */}
            {showConsultaModal && !consultaData && (
              <div className="p-3 bg-gradient-to-r from-teal-700 to-emerald-700 text-white rounded-2xl flex items-center justify-between shadow-md animate-in fade-in duration-150">
                <div className="flex items-center gap-2.5">
                  <BarChart3 className="w-5 h-5 text-emerald-200 animate-pulse shrink-0" />
                  <div>
                    <span className="text-xs font-bold block">
                      {consultando ? 'Consultando datos del carnet...' : 'MODO CONSULTA ACTIVO'}
                    </span>
                    <span className="text-[10px] text-emerald-100 block">
                      Muestre su carnet frente a la cámara para ver sus horas
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCerrarConsulta}
                  className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs transition-all flex items-center gap-1 active:scale-95 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancelar</span>
                </button>
              </div>
            )}

            {consultaError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-center text-xs font-bold animate-in shake duration-200">
                {consultaError}
              </div>
            )}

            {!processing && !feedback && !errorMsg && !showConsultaModal && (
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

            {/* Botón Minimalista de Consulta de Horas */}
            {!showConsultaModal && !processing && !feedback && (
              <div className="pt-2 border-t border-stone-100 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowConsultaModal(true);
                    setConsultaData(null);
                    setConsultaError(null);
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Consultar Mis Horas y Marcajes</span>
                </button>
              </div>
            )}
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

      {/* ── MODAL DE ACCESO ADMINISTRATIVO CON PIN 4512 ── */}
      {showAdminPinModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-stone-200 w-full max-w-sm rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-5 animate-in zoom-in-95 duration-200 select-none">
            <div className="w-14 h-14 rounded-2xl bg-[#1c6856]/10 border border-[#1c6856]/25 flex items-center justify-center text-[#1c6856] mx-auto shadow-md">
              <Lock className="w-7 h-7" />
            </div>

            <div>
              <h3 className="font-display font-black text-stone-900 text-xl tracking-tight">Acceso Administrativo</h3>
              <p className="text-xs text-stone-500 font-medium mt-1">
                Ingrese el PIN de Gerencia para abrir el panel de control.
              </p>
            </div>

            {/* Indicador de 4 Puntos PIN */}
            <div className="flex justify-center gap-4 py-2">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                    adminPinError
                      ? 'bg-rose-500 border-rose-500 animate-bounce'
                      : idx < adminPin.length
                      ? 'bg-[#1c6856] border-[#1c6856] scale-110'
                      : 'border-stone-300 bg-stone-50'
                  }`}
                />
              ))}
            </div>

            {adminPinError && (
              <p className="text-xs text-rose-600 font-bold animate-pulse">
                PIN incorrecto. Intente de nuevo.
              </p>
            )}

            {/* Teclado Numérico */}
            <div className="grid grid-cols-3 gap-2.5 max-w-[220px] mx-auto pt-1">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleAdminPinKeyPress(num)}
                  className="w-14 h-14 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-stone-100 hover:border-stone-300 active:bg-stone-200 font-bold text-lg text-stone-800 transition-all flex items-center justify-center"
                >
                  {num}
                </button>
              ))}

              <button
                type="button"
                onClick={handleAdminPinBackspace}
                className="w-14 h-14 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-stone-100 active:bg-stone-200 font-bold text-xs text-stone-600 transition-all flex items-center justify-center uppercase"
              >
                Borrar
              </button>

              <button
                type="button"
                onClick={() => handleAdminPinKeyPress('0')}
                className="w-14 h-14 rounded-2xl border border-stone-200 bg-stone-50 hover:bg-stone-100 hover:border-stone-300 active:bg-stone-200 font-bold text-lg text-stone-800 transition-all flex items-center justify-center"
              >
                0
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAdminPinModal(false);
                  setAdminPin('');
                  setAdminPinError(false);
                }}
                className="w-14 h-14 rounded-2xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-all flex items-center justify-center uppercase"
              >
                Cancelar
              </button>
            </div>

            <p className="text-[11px] text-stone-400 font-medium hidden sm:block pt-1">
              💡 Puedes ingresar el PIN con el teclado numérico de tu PC (0-9)
            </p>
          </div>
        </div>
      )}

      {/* ── MODAL FICHA DEL COLABORADOR (CONSULTA DE HORAS) ── */}
      {showConsultaModal && consultaData && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-stone-200 w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200 select-none">
            
            {/* Header del Colaborador */}
            <div className="flex items-center justify-between border-b border-stone-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 shadow-sm font-bold text-lg">
                  {consultaData.empleado.nombre.charAt(0)}{consultaData.empleado.apellido.charAt(0)}
                </div>
                <div>
                  <h3 className="font-display font-black text-stone-900 text-lg sm:text-xl tracking-tight leading-tight">
                    {consultaData.empleado.nombre} {consultaData.empleado.apellido}
                  </h3>
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-600 font-bold text-[10px] uppercase tracking-wider mt-0.5">
                    {consultaData.empleado.cargo_display}
                  </span>
                </div>
              </div>

              {/* Botón cerrar manual */}
              <button
                type="button"
                onClick={handleCerrarConsulta}
                className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 transition-all flex items-center justify-center active:scale-95"
                title="Cerrar consulta"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Banner de Turno en Curso (si está activo en este momento) */}
            {consultaData.turno_activo && (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50 border border-emerald-300/80 text-emerald-950 shadow-2xs animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-600"></span>
                  </span>
                  <div>
                    <span className="font-bold text-xs text-emerald-900 block leading-tight">
                      Turno activo en curso
                    </span>
                    <span className="text-[10.5px] text-emerald-700 font-medium">
                      Iniciaste a las {consultaData.hora_inicio_turno} • {consultaData.horas_en_curso} hrs transcurridas
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-emerald-700 text-white font-black text-[9.5px] uppercase tracking-wider shrink-0">
                  En Turno
                </span>
              </div>
            )}

            {/* Grid de Horas y Balance */}
            <div className="grid grid-cols-3 gap-3">
              {/* Horas de Hoy */}
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                  Hoy (Cerradas)
                </span>
                <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-900 block my-0.5">
                  {Number(consultaData.horas_trabajadas_hoy).toFixed(1)}
                </span>
                <span className="text-[9px] font-semibold text-emerald-700">
                  Horas netas
                </span>
              </div>

              {/* Horas del Mes */}
              <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200/80 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800 block">
                  Mes Actual
                </span>
                <span className="text-2xl sm:text-3xl font-black font-mono text-blue-900 block my-0.5">
                  {Number(consultaData.horas_mes).toFixed(1)}
                </span>
                <span className="text-[9px] font-semibold text-blue-700">
                  Total acumulado
                </span>
              </div>

              {/* Bolsa de Horas */}
              <div className={`p-3.5 rounded-2xl border text-center ${
                consultaData.horas_pendientes > 0
                  ? 'bg-rose-50 border-rose-200/80 text-rose-900'
                  : 'bg-emerald-50 border-emerald-200/80 text-emerald-900'
              }`}>
                <span className={`text-[10px] font-bold uppercase tracking-wider block ${
                  consultaData.horas_pendientes > 0 ? 'text-rose-800' : 'text-emerald-800'
                }`}>
                  Bolsa de Horas
                </span>
                <span className={`text-2xl sm:text-3xl font-black font-mono block my-0.5 ${
                  consultaData.horas_pendientes > 0 ? 'text-rose-900' : 'text-emerald-900'
                }`}>
                  {consultaData.horas_pendientes > 0 ? `-${Number(consultaData.horas_pendientes).toFixed(1)}h` : '0.0h'}
                </span>
                <span className={`text-[9px] font-semibold ${
                  consultaData.horas_pendientes > 0 ? 'text-rose-700' : 'text-emerald-700'
                }`}>
                  {consultaData.horas_pendientes > 0 ? 'Por compensar con HE ⚠️' : 'Al día ✅'}
                </span>
              </div>
            </div>

            {/* Fila Informativa: Horas Extra Aprobadas y Días Asistidos */}
            <div className="grid grid-cols-2 gap-3">
              {/* Horas Extra Aprobadas */}
              <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 shrink-0">
                    <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block leading-tight">
                      Horas Extra
                    </span>
                    <span className="text-[9px] text-amber-700 font-medium">
                      Aprobadas mes
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base sm:text-lg font-black font-mono text-amber-950 block leading-tight">
                    {Number(consultaData.horas_extra_aprobadas || 0).toFixed(1)}h
                  </span>
                  {Number(consultaData.horas_extra_pendientes || 0) > 0 && (
                    <span className="text-[8.5px] text-amber-700 font-semibold block mt-0.5">
                      +{Number(consultaData.horas_extra_pendientes).toFixed(1)}h revisión
                    </span>
                  )}
                </div>
              </div>

              {/* Días Laborados en el Mes */}
              <div className="p-3 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-700 shrink-0 text-sm">
                    📅
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-700 block leading-tight">
                      Días Mes
                    </span>
                    <span className="text-[9px] text-stone-500 font-medium">
                      Asistidos
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base sm:text-lg font-black font-mono text-stone-900 block leading-tight">
                    {consultaData.dias_trabajados_mes || 0}
                  </span>
                  <span className="text-[8.5px] text-stone-500 font-medium block mt-0.5">
                    jornadas
                  </span>
                </div>
              </div>
            </div>

            {/* Marcajes de Hoy */}
            <div className="space-y-2">
              <h4 className="font-bold text-xs text-stone-700 flex items-center justify-between">
                <span>Marcajes Registrados Hoy:</span>
                <span className="text-[10px] font-mono text-stone-400">
                  {consultaData.marcajes_hoy?.length || 0} registro(s)
                </span>
              </h4>

              {(!consultaData.marcajes_hoy || consultaData.marcajes_hoy.length === 0) ? (
                <div className="p-4 rounded-2xl bg-stone-50 border border-dashed border-stone-200 text-center text-xs text-stone-400 font-medium">
                  No se han registrado marcajes el día de hoy.
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {consultaData.marcajes_hoy.map((m: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 border border-stone-200/70 text-xs font-medium"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          m.tipo?.includes('ENTRADA') ? 'bg-emerald-500' : 'bg-amber-500'
                        }`} />
                        <span className="font-bold text-stone-800">{m.display}</span>
                      </div>
                      <span className="font-mono font-bold text-stone-600 bg-white px-2 py-0.5 rounded-lg border border-stone-200">
                        {m.hora}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Barra de Auto-Cierre de 10 Segundos y Botón Listo */}
            <div className="pt-2 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-stone-500 text-xs font-semibold">
                <Clock className="w-4 h-4 text-emerald-600 animate-spin" style={{ animationDuration: '3s' }} />
                <span>
                  Cerrando en <span className="font-mono font-bold text-emerald-700 text-sm">{consultaTimer}s</span>...
                </span>
              </div>

              <button
                type="button"
                onClick={handleCerrarConsulta}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#1c6856] hover:bg-[#155042] text-white font-bold text-xs transition-all active:scale-95 shadow-md flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Listo / Volver</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </main>
  );
}
