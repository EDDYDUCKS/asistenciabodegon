# 🏛️ BODEGÓN MASTER CONTEXT — DOCUMENTO MAESTRO DE ARQUITECTURA Y REGLAS DE NEGOCIO

> **ID de Conversación Origen:** `f00d04ee-d26f-4112-b67c-42ec576a364b`  
> **Enlace directo en Antigravity:** [Ver Conversación Completa](conversation://f00d04ee-d26f-4112-b67c-42ec576a364b)  
> **Fecha de Consolidación:** Septiembre 2026  
> **Proyecto:** Sistema Integral Restaurante El Bodegón (BodegónPass)

---

## 1. Stack Tecnológico & Infraestructura

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4, Lucide Icons, Canvas API nativo, Web Audio API nativo.
  - **Despliegue:** Vercel (conectado a rama `main` del repositorio `EDDYDUCKS/asistenciabodegon`).
  - **Rutas clave:**
    - `/kiosco`: Estación táctil/cámara para escaneo QR de colaboradores y modo consulta.
    - `/admin`: Dashboard gerencial en tiempo real.
    - `/admin/rendimiento-ayer`: Briefing ejecutivo diario y generador de fichas WhatsApp en Canvas 2x.
    - `/admin/nomina`: Liquidación, aprobación de horas extra con PIN y boletas de compensación.
    - `/admin/empleados`: Gestión de personal y credenciales QR.
    - `/admin/asistencia`: Histórico de marcajes con filtros.
- **Backend:** Django 5, Django REST Framework, PostgreSQL.
  - **Despliegue:** Render Cloud.
  - **Zona Horaria:** `America/Managua` (UTC-6).
  - **Modelos Principales:** `Empleado`, `RegistroAsistencia`, `AutorizacionHorasExtra`, `CompensacionHoras`, `AlertaAsistencia`, `DiaFeriado`, `PermisoAusencia`, `BitacoraAccion`.

---

## 2. Códigos de Seguridad y PINs

- **PIN de Gerencia Kiosco:** `4512`  
  *Función:* Permite salir del modo Kiosco pantalla completa e ingresar al panel `/admin` sin cerrar el navegador.
- **PIN de Nómina / Aprobación Horas Extra:** `2322`  
  *Función:* Requerido para autorizar horas extras de la jornada y aplicar la amortización a la Bolsa de Horas. Nunca se muestra en pantalla.

---

## 3. Lógica Laboral y Reglas de Negocio

### A. Tipos de Jornada y Turnos
1. **Turno Corrido:** Jornada base de 8.0 horas continuas.
2. **Turno Quebrado (Partida Doble):**
   - **Bloque 1 (Mañana):** Entrada matutina (típicamente 11:00 AM a 12:00 PM) hasta la salida a descanso/almuerzo (aprox. 3:00 PM).
   - **Lógica Maestra de Retorno (Cierre 11:00 PM):**
     - Si trabajó $\ge 3.8\text{h}$ en la mañana $\rightarrow$ Retorno límite: **7:00 PM**.
     - Si trabajó entre $3.2\text{h}$ y $3.8\text{h}$ (ej. 11:30 AM) $\rightarrow$ Retorno límite: **6:30 PM**.
     - Si trabajó $< 3.2\text{h}$ (ej. 12:00 PM) $\rightarrow$ Retorno límite: **6:00 PM**.
   - **Tolerancia:** 10 minutos de cortesía. Si regresa después de su hora límite + 10 min, el sistema genera alerta de impuntualidad en retorno.
3. **Turno Vespertino Especial (5:00 PM):** Jornada de 6.0 horas (salida 11:00 PM, ej. ayudantes vespertinos).

### B. Bolsa de Horas y Amortización Automática
- **Déficit Diario:** Si un empleado en turno de 8h hace menos de 8h (ej: 7.0h), acumula déficit en su Bolsa de Horas (`-1.0h`).
- **Amortización FIFO:** Cuando el colaborador genera horas extras en días posteriores (ej: trabaja 10.5h $\rightarrow$ `+2.5h` extra):
  - Al aprobar con PIN `2322`, el sistema cubre primero la deuda acumulada más antigua (FIFO).
  - El excedente restante pasa limpio como **Remanente a Pagar en Nómina**.
- **Visualización en Kiosco:** En el modal de consulta, la Bolsa de Horas se muestra como `0.0h (Al día ✅)` o `-X.Xh (Por compensar con HE ⚠️)`.

### C. Estandarización de 1 Solo Dígito Decimal
- Todos los tiempos y horas del sistema se redondean a **1 decimal** (`8.0h`, `0.6h`, `1.5h`, `0.0h`).
- En `/admin/rendimiento-ayer`, la columna **Horas Netas** tiene como tope máximo **8.0 hrs** (jornada ordinaria reglamentaria). Las horas extra se visualizan exclusivamente en su propia columna (`+X.Xh`).

---

## 4. Experiencia de Usuario en Kiosco (`/kiosco`)

- **Web Audio API:** Síntesis sonora nativa offline por tipo de evento:
  - 🟢 `ENTRADA`: Tono alegre ascendente (Do-Mi-Sol).
  - ☕ `SALIDA_QUEBRADA`: Tono cálido y relajante (La-Fa-Do). Muestra en pantalla la **Hora Límite de Regreso** calculada al vuelo.
  - 🔵 `ENTRADA_QUEBRADA`: Doble campana activa (Sol-Do). Muestra horas restantes para completar las 8.0h.
  - 🟣 `SALIDA_DEFINITIVA`: Acorde triunfal (Fa-La-Do). Total del día y felicitación si generó horas extras.
- **Tiempos de Visualización:**
  - **Confirmación post-marcaje:** **6 segundos** con barra de progreso animada y botón `Listo (6s) ✕`.
  - **Consulta de Estadísticas (PIN/Carnet):** **10 segundos** de lectura para balance mensual, bolsa de horas e historial de hoy.

---

## 5. Reporte Ejecutivo y Ficha WhatsApp (`/admin/rendimiento-ayer`)

- **HTML5 Canvas 2x Retina (1920xH px):** Generador nativo en el navegador de infografía ejecutiva.
- Incluye: Cabecera institucional El Bodegón, semáforo de asistencia/puntualidad, métricas clave, tabla de colaboradores con modalidad (corrido/quebrado) y bloque de novedades con nombre propio.
- **Acciones:** `Compartir por WhatsApp` (Web Share API en móviles), `Copiar Imagen` (portapapeles para WhatsApp Web en desktop) y `Descargar PNG`.
