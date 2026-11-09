import { redirect } from 'next/navigation';

/** La vista del efectivo ahora es el control online (/control). Se deja el enlace viejo funcionando. */
export default function EfectivoPage() {
  redirect('/control');
}
