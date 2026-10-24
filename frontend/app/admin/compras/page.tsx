'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RedirectAdminCompras() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/control');
  }, [router]);

  return (
    <div className="min-h-screen bg-crema flex items-center justify-center font-sans">
      <div className="text-center space-y-2">
        <p className="text-sm font-bold text-stone-600">Redirigiendo a Bodegón Control...</p>
      </div>
    </div>
  );
}
