import Link from 'next/link';
import Image from 'next/image';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#fcf9f5] flex flex-col items-center justify-center p-6 text-center font-sans">
      <div className="w-20 h-20 rounded-full overflow-hidden shadow-xl shadow-[#1c6856]/25 border-2 border-[#1c6856]/20 bg-[#1c6856] mb-6">
        <Image
          src="/logo.png"
          alt="Restaurante El Bodegón"
          width={80}
          height={80}
          className="w-full h-full object-cover"
        />
      </div>
      <p className="text-xs font-bold uppercase tracking-wider text-stone-500">Error 404</p>
      <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#1c6856] mt-2">
        Página no encontrada
      </h1>
      <p className="text-sm text-stone-600 mt-3 max-w-md">
        La dirección que buscas no existe o fue movida. Revisa el enlace o vuelve al inicio.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center rounded-2xl bg-[#1c6856] px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-[#15503f] transition-colors"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
