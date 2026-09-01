'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertaAsistencia } from '@/lib/types';
import { fetchAlertas, updateAlerta } from '@/lib/api-client';
import {
  Utensils,
  LayoutDashboard,
  Users,
  CalendarCheck,
  FileSpreadsheet,
  QrCode,
  RefreshCw,
  Bell,
  Check,
  BellOff,
  AlertTriangle,
} from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pin, setPin] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Estados de Alertas
  const [alerts, setAlerts] = useState<AlertaAsistencia[]>([]);
  const [showAlertsDropdown, setShowAlertsDropdown] = useState(false);

  const navItems = [
    { label: 'Dashboard', href: '/admin', icon: <LayoutDashboard className="w-4 h-4" /> },
    { label: 'Empleados & Carnets', href: '/admin/empleados', icon: <Users className="w-4 h-4" /> },
    { label: 'Asistencia & Fotos', href: '/admin/asistencia', icon: <CalendarCheck className="w-4 h-4" /> },
    { label: 'Nómina & Horas', href: '/admin/nomina', icon: <FileSpreadsheet className="w-4 h-4" /> },
  ];

  const loadAlerts = async () => {
    try {
      const list = await fetchAlertas();
      setAlerts(list);
    } catch (e) {
      console.warn('Error fetching alerts:', e);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isAuth = sessionStorage.getItem('admin_auth_pin_verified');
      if (isAuth === 'true') {
        setAuthorized(true);
        loadAlerts();
      }
      setCheckingAuth(false);
    }
  }, []);

  // Encuestas periódicas para alertas si está autorizado
  useEffect(() => {
    if (!authorized) return;
    const interval = setInterval(loadAlerts, 10000); // Cada 10s para ver inmediato tardanzas
    return () => clearInterval(interval);
  }, [authorized]);

  const handleMarkAsRead = async (id: number) => {
    try {
      await updateAlerta(id, { leida: true });
      loadAlerts();
    } catch (e) {
      console.warn(e);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const unread = alerts.filter(a => !a.leida);
      await Promise.all(unread.map(a => updateAlerta(a.id!, { leida: true })));
      loadAlerts();
    } catch (e) {
      console.warn(e);
    }
  };

  const playFailSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  };

  const handleKeyPress = (num: string) => {
    setPinError(false);
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      if (newPin === '1012') {
        sessionStorage.setItem('admin_auth_pin_verified', 'true');
        setAuthorized(true);
        setPin('');
        loadAlerts();
      } else if (newPin.length === 4) {
        setTimeout(() => {
          setPinError(true);
          setPin('');
          playFailSound();
        }, 200);
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    setPinError(false);
  };

  const unreadCount = alerts.filter(a => !a.leida).length;

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#fcf9f5] flex items-center justify-center font-sans">
        <RefreshCw className="w-8 h-8 text-[#1c6856] animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="min-h-screen bg-[#fcf9f5] flex flex-col justify-between p-6 sm:p-12 font-sans text-stone-850 select-none">
        <div className="max-w-md w-full mx-auto my-auto bg-white border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-sm text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-[#1c6856] flex items-center justify-center text-white mx-auto shadow-md">
            <Utensils className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-black text-xl text-[#1c6856] tracking-tight">Acceso Administrativo</h2>
            <p className="text-xs text-stone-500 font-bold mt-1 uppercase tracking-wide">Restaurante El Bodegón</p>
          </div>

          {/* Indicador de PIN */}
          <div className="flex justify-center gap-4 py-3">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                  pinError
                    ? 'bg-rose-500 border-rose-500 animate-bounce'
                    : idx < pin.length
                    ? 'bg-[#1c6856] border-[#1c6856] scale-110'
                    : 'border-stone-300 bg-stone-50'
                }`}
              />
            ))}
          </div>

          {pinError && (
            <p className="text-xs text-rose-600 font-bold animate-pulse">
              PIN incorrecto. Intente de nuevo.
            </p>
          )}

          {/* Teclado Numérico */}
          <div className="grid grid-cols-3 gap-3 max-w-[240px] mx-auto pt-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                onClick={() => handleKeyPress(num)}
                className="w-16 h-16 rounded-2xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 hover:border-stone-300 active:bg-stone-100 font-bold text-lg text-stone-800 transition-all flex items-center justify-center"
              >
                {num}
              </button>
            ))}
            
            {/* Backspace */}
            <button
              onClick={handleBackspace}
              className="w-16 h-16 rounded-2xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 hover:border-stone-300 active:bg-stone-100 font-bold text-xs text-stone-600 transition-all flex items-center justify-center uppercase tracking-wide"
            >
              Borrar
            </button>
            
            <button
              onClick={() => handleKeyPress('0')}
              className="w-16 h-16 rounded-2xl border border-stone-200 bg-stone-50/50 hover:bg-stone-50 hover:border-stone-300 active:bg-stone-100 font-bold text-lg text-stone-800 transition-all flex items-center justify-center"
            >
              0
            </button>

            {/* Cancel/Home */}
            <Link
              href="/"
              className="w-16 h-16 rounded-2xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition-all flex items-center justify-center uppercase tracking-wide"
            >
              Salir
            </Link>
          </div>
        </div>
        
        <footer className="text-center text-[10px] text-stone-400 font-medium">
          Restaurante El Bodegón © 2026 — Acceso Protegido
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fcf9f5] text-stone-850 flex flex-col font-sans">
      {/* Navbar Superior con Efecto Cristal (Glassmorphic) */}
      <header className="glass-dock sticky top-0 z-50 shadow-premium border-b border-stone-200/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
              <div className="w-10 h-10 rounded-xl bg-[#1c6856] flex items-center justify-center text-white shadow-sm">
                <Utensils className="w-5 h-5" />
              </div>
              <div>
                <span className="font-black text-lg text-[#1c6856] tracking-tight flex items-center gap-1.5">
                  El Bodegón
                  <span className="text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-[#1c6856]/10 text-[#1c6856]">
                    Admin
                  </span>
                </span>
              </div>
            </Link>
          </div>

          {/* Navegación Desktop */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                    active
                      ? 'bg-[#1c6856] text-white shadow-sm shadow-[#1c6856]/30'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            {/* Campana de Notificaciones en Tiempo Real */}
            <div className="relative">
              <button
                onClick={() => setShowAlertsDropdown(!showAlertsDropdown)}
                className="p-2 rounded-xl bg-stone-50 border border-stone-200 text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-all relative flex"
                title="Alertas de Asistencia"
              >
                <Bell className="w-4.5 h-4.5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full bg-rose-500 text-white font-black text-[9px] flex items-center justify-center border-2 border-white animate-bounce">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showAlertsDropdown && (
                <div className="absolute right-0 mt-2.5 w-80 bg-white border border-stone-200 rounded-2xl shadow-2xl p-4 z-50 space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                    <h4 className="font-black text-xs text-[#1c6856] flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5" />
                      Alertas de Asistencia
                    </h4>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllAsRead}
                        className="text-[10px] text-stone-500 font-bold hover:underline"
                      >
                        Marcar todo leído
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                    {alerts.length === 0 ? (
                      <div className="py-8 text-center text-[11px] text-stone-400 font-medium flex flex-col items-center gap-1.5">
                        <BellOff className="w-6 h-6 text-stone-300" />
                        No hay alertas registradas
                      </div>
                    ) : (
                      alerts.map((al) => (
                        <div
                          key={al.id}
                          className={`p-3 rounded-2xl border transition-all text-left flex flex-col gap-2 relative group ${
                            al.leida
                              ? 'bg-stone-50/50 border-stone-150 opacity-70'
                              : 'bg-rose-50/20 border-rose-200 shadow-sm'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className={`p-1.5 rounded-lg shrink-0 self-start ${
                              al.tipo === 'SEGUNDA_AUSENCIA'
                                ? 'bg-purple-100 text-purple-700'
                                : al.tipo === 'REGISTRO_INCOMPLETO'
                                ? 'bg-orange-100 text-orange-700'
                                : al.tipo === 'TARDANZA'
                                ? 'bg-rose-100 text-rose-600'
                                : 'bg-amber-100 text-amber-600'
                            }`}>
                              <AlertTriangle className="w-4 h-4" />
                            </div>
                            
                            <div className="flex-1 min-w-0 pr-4">
                              <h5 className="font-bold text-xs text-stone-900 leading-tight">
                                {al.titulo}
                              </h5>
                              <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
                                {al.mensaje}
                              </p>
                              <span className="text-[9px] font-mono text-stone-400 block mt-1">
                                {al.created_at ? new Date(al.created_at).toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </div>

                            {!al.leida && al.tipo !== 'SEGUNDA_AUSENCIA' && (
                              <button
                                onClick={() => handleMarkAsRead(al.id!)}
                                className="absolute top-2.5 right-2.5 p-1 rounded-md hover:bg-stone-100 text-stone-400 hover:text-[#1c6856] opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Marcar como leída"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Acciones interactivas para Segunda Ausencia */}
                          {!al.leida && al.tipo === 'SEGUNDA_AUSENCIA' && (
                            <div className="flex gap-2 pt-2 border-t border-rose-100">
                              <button
                                onClick={async () => {
                                  const { resolverAlerta } = await import('@/lib/api-client');
                                  await resolverAlerta(al.id!, 'JUSTIFICAR');
                                  loadAlerts();
                                }}
                                className="flex-1 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 text-[10px] font-bold py-1.5 px-2 rounded-lg transition-colors"
                              >
                                ✅ Justificar Falta
                              </button>
                              <button
                                onClick={async () => {
                                  const { resolverAlerta } = await import('@/lib/api-client');
                                  await resolverAlerta(al.id!, 'SUMAR_DEUDA');
                                  loadAlerts();
                                }}
                                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold py-1.5 px-2 rounded-lg transition-colors shadow-sm"
                              >
                                ⏳ Sumar 8h de Deuda
                              </button>
                            </div>
                          )}

                          {/* Acción directa para Registro Incompleto */}
                          {!al.leida && al.tipo === 'REGISTRO_INCOMPLETO' && (
                            <div className="pt-1.5 border-t border-orange-100 flex justify-end">
                              <Link
                                href="/admin/asistencia"
                                onClick={() => setShowAlertsDropdown(false)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-700 hover:underline"
                              >
                                Agregar Salida en Asistencia &rarr;
                              </Link>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <Link
              href="/kiosco"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1c6856]/5 border border-[#1c6856]/20 hover:bg-[#1c6856]/10 text-xs font-bold text-[#1c6856] transition-colors"
            >
              <QrCode className="w-4 h-4" />
              Abrir Kiosco
            </Link>
          </div>
        </div>
      </header>

      {/* Navegación Mobile */}
      <div className="md:hidden bg-white border-b border-stone-200 px-4 py-2 flex items-center justify-around overflow-x-auto shadow-sm">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-colors ${
                active ? 'text-[#1c6856]' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
