# El Bodegón Pass

Sistema web de control de asistencia, horas extra y nómina para el Restaurante & Bar El Bodegón (León, Nicaragua).  
Proyecto de la asignatura **Tecnología de la Información** (Universidad Tecnológica La Salle, ULSA), unidad *Fundamentos y transformación digital*.

- **Docente:** M.Sc. Valeria Medina Rodríguez
- **Equipo:** Eddy Martínez, Cristoffer Betancourt y Erick Amaya

---

## 1. ¿Qué hace?

El sistema reemplaza el cuaderno de firmas y el cálculo manual de la quincena. Este repositorio se evalúa sobre dos funciones principales:

1. **Marcaje con carnet QR y foto de verificación** (`/kiosco`), con cola local en IndexedDB/LocalStorage para seguir registrando sin internet y sincronización por lotes (`sync-batch`) al volver la red.
2. **Horas extra con bolsa de horas** (`/admin/nomina`): el sistema detecta el excedente sobre 8 horas continuas o jornada partida, compensa deudas previas 1 a 1 y deja la solicitud para que la administración la apruebe o rechace con validación de PIN en servidor. Genera boleta oficial con folio (RPHE) y exporta la planilla consolidada a Excel.

También incluye gestión de colaboradores y generación de carnets imprimibles, feriados automáticos (cómputo al 200% o acreditación de descanso), deducción/registro de vacaciones, control de compras/gastos y bitácora de auditoría.

---

## 2. Arquitectura y tecnologías

| Capa | Tecnología | Despliegue |
|---|---|---|
| Frontend y Kiosco | Next.js 16, React 19, TypeScript, Tailwind CSS 4 | Vercel |
| Backend (API REST) | Django 5, Django REST Framework, Python 3.12 | Render Cloud |
| Base de Datos | PostgreSQL (AWS Pooler Supabase / SQLite en dev) | Supabase |

Tecnologías habilitadoras: **computación en la nube** y **analítica de datos** (reglas automatizadas de balance de horas, déficit, amortización 1:1, horas extra y nómina). No se utiliza inteligencia artificial ni IoT.

---

## 3. Estructura del repositorio

```
backend/
  asistencia/          app Django: modelos, vistas, serializers, urls, migraciones
  sgp_asistencia/      configuración del proyecto Django (settings, wsgi, asgi)
  scripts/             utilidades de mantenimiento y migración
  seed_data.py         carga de colaboradores de prueba ficticios
  test_*.py            batería de pruebas automatizadas de turnos y reglas
  simulate_week.py     simulación integral de quincena/semana operativa
  verify_nomina.py     verificación matemática de cálculos de nómina
  build.sh             script de construcción para despliegue en Render
  requirements.txt     dependencias de Python
frontend/
  app/                 rutas Next.js: /kiosco, /admin, /admin/nomina, /admin/asistencia, /admin/empleados, /control
  components/          componentes reutilizables, modales y compuertas de seguridad
  lib/                 cliente de API tipado (api-client.ts) y utilidades de audio/tiempo
```

---

## 4. Requisitos

- Python 3.12+
- Node.js 20+ y npm
- Git
- (Opcional) PostgreSQL. Si no se define `DATABASE_URL`, el backend utiliza automáticamente SQLite local.

---

## 5. Instalación

### Backend

```bash
cd backend
python -m venv env
# En Windows (PowerShell / CMD):
.\env\Scripts\activate
# En Linux / macOS:
source env/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser   # Opcional, para el panel /admin de Django
```

### Frontend

```bash
cd frontend
npm install
```

---

## 6. Configuración

Copia los valores de ejemplo de `.env.example` y ajústalos según tu entorno. **No subas claves, contraseñas ni tokens al repositorio.**

**Backend** (Variables de entorno en `.env` o variables de Render):

| Variable | Descripción | Valor de ejemplo |
|---|---|---|
| `SECRET_KEY` | Clave criptográfica de Django. **Obligatoria**: sin ella el servidor no arranca (salvo con `DEBUG=True`) | Genera una con `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `DEBUG` | Modo depuración | `True` (local) / `False` (producción) |
| `DATABASE_URL` | Conexión a PostgreSQL (si no se define, usa SQLite) | `postgresql://postgres:clave@host:5432/postgres` |
| `BACKUP_ADMIN_KEY` | Clave para descargar el respaldo de la DB. **Obligatoria**: sin ella el servidor no arranca (salvo con `DEBUG=True`). El panel la pide al pulsar «Respaldo» | Genera otra con el mismo comando |
| `ADMIN_PAYROLL_PIN` | PIN para aprobar horas extra y pagos en servidor | `2322` |

**Frontend** (archivo `frontend/.env.local` o variables en Vercel):

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000/api
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anonima-publica
```

---

## 7. Ejecución en local

**Terminal 1 (Backend):**
```bash
cd backend
.\env\Scripts\activate
python manage.py runserver        # Servidor en http://127.0.0.1:8000
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev                       # Aplicación en http://localhost:3000
```

Rutas principales disponibles:
- `/kiosco`: Terminal de marcaje con QR y captura de foto de verificación.
- `/admin`: Panel de control general.
- `/admin/asistencia`: Consulta y filtrado de asistencia con evidencia fotográfica.
- `/admin/nomina`: Gestión de bolsa de horas, aprobación de horas extra y exportación de nómina.
- `/admin/empleados`: Gestión de colaboradores y generación de carnets.

*Nota:* El acceso a la cámara en el Kiosco funciona nativamente en `localhost` o en conexiones seguras con HTTPS.

---

## 8. Datos de prueba

```bash
cd backend
python seed_data.py
```

Crea colaboradores de prueba ficticios y genera tokens QR para cada uno. Los carnets con códigos QR se pueden previsualizar e imprimir desde `/admin/empleados`. No se utilizan datos personales reales para fines académicos ni de demostración.

---

## 9. Cómo ejecutar la demostración

1. Inicia backend y frontend (sección 7) y carga los datos de prueba (sección 8).
2. Abre `/admin/empleados` y visualiza el carnet QR de un colaborador de prueba en pantalla o impreso.
3. Abre `/kiosco`, acerca el carnet QR a la cámara web y registra **Entrada**; registra luego la **Salida** (o ejecuta los scripts de simulación para emular turnos completos).
4. Abre `/admin/asistencia` y constata el marcaje registrado junto a su foto de auditoría.
5. Abre `/admin/nomina`, dirígete a la pestaña **Horas extra**: previsualiza la solicitud, revisa la amortización automática con la bolsa de horas y aprueba ingresando el PIN de administración.
6. Genera el recibo oficial de pago (RPHE) y descarga la planilla en formato Excel.
7. **Demostración de modo sin internet:** Desconecta el adaptador de red en el dispositivo kiosco, realiza un marcaje, comprueba que se guarda en la cola local, restablece la conexión a internet y verifica su sincronización automática por lotes.

El PIN administrativo de demostración se entrega por separado al docente evaluador.

---

## 10. Pruebas automatizadas

Las pruebas de nómina (horas extra y bolsa de horas, tardanza, vacaciones y marcaje del kiosco) están en `backend/asistencia/tests/` y corren solas en GitHub Actions en cada push a `main` y en cada pull request:

```bash
cd backend
python manage.py test asistencia
```

Django crea una base de datos de prueba temporal y la borra al terminar, así que no tocan los datos reales.

Scripts de diagnóstico que siguen disponibles:

```bash
python verify_nomina.py       # Balance de nómina del 01 al 15 de agosto 2026
python simulate_week.py       # Simulación de ciclo semanal completo
```

> [!WARNING]
> `simulate_week.py` borra y crea registros en la base de datos configurada. Ejecútalo únicamente en el entorno local (SQLite, sin configurar `DATABASE_URL` de producción).

La matriz de pruebas completa con capturas de evidencia se encuentra en el documento *Evidencia de pruebas*.

---

## 11. Despliegue

- **Backend (Render):** `bash build.sh` instala las dependencias de Python, recolecta archivos estáticos con WhiteNoise y ejecuta migraciones. Se sirve mediante `gunicorn sgp_asistencia.wsgi`.
- **Frontend (Vercel):** Conectado al repositorio en la rama `main`; compila la aplicación Next.js y consume el backend en la nube mediante `NEXT_PUBLIC_API_URL`.

---

## 12. Seguridad y Estado de Auditoría

En la auditoría técnica previa a la entrega se identificaron y mitigaron los siguientes aspectos de seguridad:

- **Validación de PIN Server-Side:** La autorización de horas extra y emisión de pagos ya no depende únicamente de la interfaz; el servidor Django exige el PIN administrativo en el payload (`ADMIN_PAYROLL_PIN`) y deniega con `403 Forbidden` cualquier intento no autorizado.
- **Protección de Volcado de Datos:** El endpoint `/api/admin/respaldo-datos/` está bloqueado contra accesos anónimos y exige la cabecera `X-Admin-Backup-Key` o credenciales staff, registrando intentos indebidos en la bitácora con IP.
- **Sanitización de Datos de Empleados:** Se retiraron los tokens QR y cédulas de los serializadores anidados de asistencia y horas extra para evitar fuga de credenciales.
- **CORS Restringido:** Se eliminó `CORS_ALLOW_ALL_ORIGINS = True` y se configuró una lista estricta de orígenes permitidos (`asistenciabodegon.vercel.app`, `localhost:3000`).
- **Política de Retención y Privacidad:** Las fotos de verificación tomadas en el kiosco se restringen al uso exclusivo de auditoría de asistencia interna.

---

## 13. Participación del equipo

El historial de commits y control de versiones refleja la colaboración del equipo:

| Integrante | Rol y Aportes Principales |
|---|---|
| **Eddy Martínez** | Arquitectura general del sistema, motor de cálculo laboral en backend Django (bolsa de horas, turnos partidos, compensación 1:1), desarrollo del Kiosco offline y hardening de seguridad en API REST. |
| **Cristoffer Betancourt** | Diseño y maquetación de interfaces en Next.js/Tailwind CSS, módulo de administración de colaboradores, generación e impresión de carnets QR y pruebas de usabilidad del kiosco. |
| **Erick Amaya** | Diseño y ejecución de la matriz de pruebas unitarias/integración, elaboración del módulo de reportería Excel de nómina/vacaciones, configuración de entornos y documentación del repositorio. |

---

## 14. Licencia y atribuciones

El código desarrollado en este proyecto se distribuye bajo la licencia **MIT** (consultar archivo `LICENSE`).

Componentes y bibliotecas de terceros utilizados:

| Componente | Licencia |
|---|---|
| Next.js, React, Tailwind CSS, @supabase/supabase-js | MIT |
| lucide-react, qrcode.react | ISC |
| html5-qrcode | Apache-2.0 |
| Django, Django REST Framework, dj-database-url | BSD |
| django-cors-headers, whitenoise, gunicorn, openpyxl, et_xmlfile | MIT |
| Pillow | HPND |
| psycopg2-binary | LGPL |

Servicios en la nube operados bajo sus planes educativos y de desarrollo: Vercel, Render y Supabase.
