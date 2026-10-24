'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import PinScreen from '@/components/PinScreen';
import { playErrorBeep } from '@/lib/sound-feedback';
import { loginAdmin, getAdminToken, clearAdminToken } from '@/lib/api-client';

interface PinSecurityGateProps {
  title?: string;
  subtitle?: string;
  sessionKey?: string;
  children: React.ReactNode;
}

export default function PinSecurityGate({
  title = 'Bodegón Control',
  subtitle = 'Módulo de Compras, Gastos & Caja Chica',
  sessionKey = 'bodegon_control_pin_verified',
  children,
}: PinSecurityGateProps) {
  const [pin, setPin] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [pinErrorMsg, setPinErrorMsg] = useState('PIN incorrecto. Intente de nuevo.');
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const handleLogout = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(sessionKey);
    }
    clearAdminToken();
    setAuthorized(false);
    setPin('');
    setPinError(false);
  }, [sessionKey]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isAuth = sessionStorage.getItem(sessionKey);
      if (isAuth === 'true' && getAdminToken()) {
        setAuthorized(true);
      }
      setCheckingAuth(false);
    }
  }, [sessionKey]);

  // Inactividad auto-bloqueo a los 10 minutos
  useEffect(() => {
    if (!authorized) return;
    const TIMEOUT = 10 * 60 * 1000;
    let timer = setTimeout(handleLogout, TIMEOUT);

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(handleLogout, TIMEOUT);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('touchstart', resetTimer);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
    };
  }, [authorized, handleLogout]);

  // El PIN se valida en el servidor; el frontend no conoce el PIN correcto
  const submitPin = useCallback(
    async (candidate: string) => {
      setVerifyingPin(true);
      try {
        await loginAdmin(candidate);
        sessionStorage.setItem(sessionKey, 'true');
        setAuthorized(true);
        setPin('');
      } catch (e: unknown) {
        setPinErrorMsg(e instanceof Error ? e.message : 'PIN incorrecto. Intente de nuevo.');
        setPinError(true);
        setPin('');
        playErrorBeep();
      } finally {
        setVerifyingPin(false);
      }
    },
    [sessionKey]
  );

  const handleKeyPress = useCallback(
    (num: string) => {
      if (verifyingPin || pin.length >= 4) return;
      setPinError(false);
      const nextPin = pin + num;
      setPin(nextPin);
      if (nextPin.length === 4) void submitPin(nextPin);
    },
    [pin, verifyingPin, submitPin]
  );

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setPinError(false);
  }, []);

  // Soporte de Teclado Físico
  useEffect(() => {
    if (authorized) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPin('');
        setPinError(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authorized, handleKeyPress, handleBackspace]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-crema flex items-center justify-center font-sans">
        <RefreshCw className="w-8 h-8 text-amber-600 animate-spin" />
      </div>
    );
  }

  if (!authorized) {
    return (
      <PinScreen
        eyebrow="Acceso protegido"
        title={title}
        subtitle={subtitle}
        pin={pin}
        pinError={pinError}
        pinErrorMsg={pinErrorMsg}
        verifyingPin={verifyingPin}
        onKey={handleKeyPress}
        onBackspace={handleBackspace}
        onExit={handleLogout}
      />
    );
  }

  return <>{children}</>;
}
