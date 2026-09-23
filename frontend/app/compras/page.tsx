'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ComprasRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/control');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#fcf9f5] flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm text-center max-w-sm">
        <div className="w-10 h-10 mx-auto mb-3 rounded-2xl bg-[#1c6856] text-white flex items-center justify-center font-bold">
          EB
        </div>
        <h2 className="font-black text-stone-900 text-sm">Redirigiendo a Bodegón Control...</h2>
        <p className="text-xs text-stone-500 mt-1">El panel único y completo está centralizado en /control</p>
      </div>
    </div>
  );
}
