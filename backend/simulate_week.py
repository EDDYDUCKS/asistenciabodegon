import os
import django
import sys
import datetime

# Inicializar Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sgp_asistencia.settings')
django.setup()

from django.utils import timezone
from asistencia.models import Empleado, RegistroAsistencia, AlertaAsistencia, AutorizacionHorasExtra, DiaFeriado

def simulate():
    print("====================================================")
    print("[SIMULACION] CARGANDO 15 DIAS DE TRABAJO (01 AL 15 AGOSTO 2026)")
    print("====================================================")

    # 1. Limpiar base de datos
    RegistroAsistencia.objects.all().delete()
    AlertaAsistencia.objects.all().delete()
    AutorizacionHorasExtra.objects.all().delete()
    DiaFeriado.objects.all().delete()
    print("Base de datos limpia.")

    # 2. Registrar Días Feriados
    feriado_1 = datetime.date(2026, 8, 1) # Sábado
    feriado_2 = datetime.date(2026, 8, 10) # Lunes
    
    DiaFeriado.objects.create(fecha=feriado_1, descripcion="Santo Domingo de Guzman - Bajada")
    DiaFeriado.objects.create(fecha=feriado_2, descripcion="Santo Domingo de Guzman - Subida")
    print(f"Feriados nacionales creados: 01/08 (Bajada) y 10/08 (Subida)")

    try:
        eddy = Empleado.objects.get(nombre__icontains="Eddy")
        ana = Empleado.objects.get(nombre__icontains="Ana")
        carlos = Empleado.objects.get(nombre__icontains="Carlos")
        maria = Empleado.objects.get(nombre__icontains="Mar")
        roberto = Empleado.objects.get(nombre__icontains="Robert")
        
        # Configurar tipos de turno correspondientes
        carlos.tipo_turno = 'QUEBRADO'
        carlos.save()
        for e in [eddy, ana, maria, roberto]:
            e.tipo_turno = 'CORRIDO'
            e.save()
    except Empleado.DoesNotExist:
        print("Error: Empleados base no encontrados.")
        return

    ni_tz = timezone.get_current_timezone()

    # Generar rango del 1 al 15 de agosto
    fecha_inicio = datetime.date(2026, 8, 1)
    fecha_fin = datetime.date(2026, 8, 15)
    
    curr = fecha_inicio
    dias = []
    while curr <= fecha_fin:
        dias.append(curr)
        curr += datetime.timedelta(days=1)

    for dia in dias:
        # Domingos: descanso general
        if dia.weekday() == 6:
            continue

        # ── ANA TORRES (Corrido 2: 3pm - 11pm) ──────────────────────────────────
        # Trabaja siempre, incluidos feriados
        # Miércoles 12 de agosto: llega 10 min tarde (3:10 PM)
        if dia == datetime.date(2026, 8, 12):
            ent = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(15, 10, 0)), ni_tz)
            sal = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(23, 0, 0)), ni_tz)
            _registrar_asistencia(ana, 'ENTRADA', ent)
            _registrar_asistencia(ana, 'SALIDA_DEFINITIVA', sal)
        else:
            ent = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(15, 0, 0)), ni_tz)
            sal = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(23, 0, 0)), ni_tz)
            _registrar_asistencia(ana, 'ENTRADA', ent)
            _registrar_asistencia(ana, 'SALIDA_DEFINITIVA', sal)

        # ── CARLOS MENDOZA (Quebrado: 12md - 3pm, 6pm - 11pm) ───────────────────
        # Trabaja siempre puntual, incluidos feriados
        c_e1 = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(12, 0, 0)), ni_tz)
        c_s1 = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(15, 0, 0)), ni_tz)
        c_e2 = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(18, 0, 0)), ni_tz)
        c_s2 = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(23, 0, 0)), ni_tz)
        _registrar_asistencia(carlos, 'ENTRADA', c_e1)
        _registrar_asistencia(carlos, 'SALIDA_QUEBRADA', c_s1)
        _registrar_asistencia(carlos, 'ENTRADA_QUEBRADA', c_e2)
        _registrar_asistencia(carlos, 'SALIDA_DEFINITIVA', c_s2)

        # ── EDDY MARTINEZ (Corrido 1: 12md - 8pm) ──────────────────────────────
        # Faltas: Jueves 6 y Jueves 13
        if dia in [datetime.date(2026, 8, 6), datetime.date(2026, 8, 13)]:
            pass
        # Sábado 1 (Holiday): Sale temprano y solo acumula 7.50 hrs (< 8h threshold!)
        elif dia == datetime.date(2026, 8, 1):
            ent = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(12, 0, 0)), ni_tz)
            sal = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(19, 30, 0)), ni_tz)
            _registrar_asistencia(eddy, 'ENTRADA', ent)
            _registrar_asistencia(eddy, 'SALIDA_DEFINITIVA', sal)
        # Martes 4: Llega 12 min tarde (12:12 PM)
        elif dia == datetime.date(2026, 8, 4):
            ent = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(12, 12, 0)), ni_tz)
            sal = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(20, 0, 0)), ni_tz)
            _registrar_asistencia(eddy, 'ENTRADA', ent)
            _registrar_asistencia(eddy, 'SALIDA_DEFINITIVA', sal)
        # Martes 11: Llega 10 min tarde (12:10 PM)
        elif dia == datetime.date(2026, 8, 11):
            ent = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(12, 10, 0)), ni_tz)
            sal = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(20, 0, 0)), ni_tz)
            _registrar_asistencia(eddy, 'ENTRADA', ent)
            _registrar_asistencia(eddy, 'SALIDA_DEFINITIVA', sal)
        # Resto de días normal
        else:
            ent = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(12, 0, 0)), ni_tz)
            sal = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(20, 0, 0)), ni_tz)
            _registrar_asistencia(eddy, 'ENTRADA', ent)
            _registrar_asistencia(eddy, 'SALIDA_DEFINITIVA', sal)

        # ── MARÍA GARCÍA (Corrido 1: 12md - 8pm) ────────────────────────────────
        # Feriados: Libre, no trabaja (01/08 y 10/08)
        if dia in [datetime.date(2026, 8, 1), datetime.date(2026, 8, 10)]:
            pass
        # Sábado 8: Sale 10 min temprano (7:50 PM)
        elif dia == datetime.date(2026, 8, 8):
            ent = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(12, 0, 0)), ni_tz)
            sal = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(19, 50, 0)), ni_tz)
            _registrar_asistencia(maria, 'ENTRADA', ent)
            _registrar_asistencia(maria, 'SALIDA_DEFINITIVA', sal)
        # Sábado 15: Sale 15 min temprano (7:45 PM)
        elif dia == datetime.date(2026, 8, 15):
            ent = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(12, 0, 0)), ni_tz)
            sal = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(19, 45, 0)), ni_tz)
            _registrar_asistencia(maria, 'ENTRADA', ent)
            _registrar_asistencia(maria, 'SALIDA_DEFINITIVA', sal)
        # Resto de días normal
        else:
            ent = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(12, 0, 0)), ni_tz)
            sal = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(20, 0, 0)), ni_tz)
            _registrar_asistencia(maria, 'ENTRADA', ent)
            _registrar_asistencia(maria, 'SALIDA_DEFINITIVA', sal)

        # ── ROBERTO LÓPEZ (Corrido 2: 3pm - 11pm) ───────────────────────────────
        # Feriados: Libre, no trabaja (01/08 y 10/08)
        if dia in [datetime.date(2026, 8, 1), datetime.date(2026, 8, 10)]:
            pass
        # Viernes 7: Llega 15 min tarde (3:15 PM)
        elif dia == datetime.date(2026, 8, 7):
            ent = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(15, 15, 0)), ni_tz)
            sal = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(23, 0, 0)), ni_tz)
            _registrar_asistencia(roberto, 'ENTRADA', ent)
            _registrar_asistencia(roberto, 'SALIDA_DEFINITIVA', sal)
        # Viernes 14: Llega 20 min tarde (3:20 PM)
        elif dia == datetime.date(2026, 8, 14):
            ent = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(15, 20, 0)), ni_tz)
            sal = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(23, 0, 0)), ni_tz)
            _registrar_asistencia(roberto, 'ENTRADA', ent)
            _registrar_asistencia(roberto, 'SALIDA_DEFINITIVA', sal)
        # Resto de días normal
        else:
            ent = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(15, 0, 0)), ni_tz)
            sal = timezone.make_aware(datetime.datetime.combine(dia, datetime.time(23, 0, 0)), ni_tz)
            _registrar_asistencia(roberto, 'ENTRADA', ent)
            _registrar_asistencia(roberto, 'SALIDA_DEFINITIVA', sal)

    print("\n15 días de simulación de nómina cargados exitosamente.")
    print("====================================================")

def _registrar_asistencia(empleado, tipo_evento, fecha_hora):
    registro = RegistroAsistencia.objects.create(
        empleado=empleado,
        tipo_evento=tipo_evento,
        fecha_hora=fecha_hora
    )
    _trigger_alerts_and_overtime(registro)

def _trigger_alerts_and_overtime(registro):
    empleado = registro.empleado
    hora_actual = registro.fecha_hora.astimezone(timezone.get_current_timezone())
    tipo = registro.tipo_evento
    hoy = hora_actual.date()

    # Rango del día
    start_dt = timezone.make_aware(datetime.datetime.combine(hoy, datetime.time.min), timezone.get_current_timezone())
    end_dt = timezone.make_aware(datetime.datetime.combine(hoy, datetime.time.max), timezone.get_current_timezone())

    registros_actualizados = list(RegistroAsistencia.objects.filter(
        empleado=empleado,
        fecha_hora__range=(start_dt, end_dt)
    ).order_by('fecha_hora'))

    from asistencia.views import _calcular_horas_netas_dia
    horas_netas_hoy = _calcular_horas_netas_dia(registros_actualizados)

    # Lógica de horas extras
    if tipo == 'SALIDA_DEFINITIVA' and horas_netas_hoy > 8.0:
        horas_extra = horas_netas_hoy - 8.0
        AutorizacionHorasExtra.objects.update_or_create(
            empleado=empleado,
            fecha=hoy,
            defaults={
                'horas_extra_solicitadas': round(horas_extra, 2),
                'estado': 'PENDIENTE'
            }
        )

    # Lógica de Alertas
    tiene_quebrado = any(r.tipo_evento in ['SALIDA_QUEBRADA', 'ENTRADA_QUEBRADA'] for r in registros_actualizados)
    primera_ent = next((r for r in registros_actualizados if r.tipo_evento in ['ENTRADA', 'ENTRADA_QUEBRADA']), None)
    
    turno_detectado = 'Desconocido'
    if tiene_quebrado:
        turno_detectado = 'Quebrado'
    elif primera_ent:
        dt_ent = primera_ent.fecha_hora.astimezone(timezone.get_current_timezone())
        if dt_ent.hour >= 14:
            turno_detectado = 'Corrido 2'
        else:
            turno_detectado = 'Corrido 1'

    mins_marcados = hora_actual.hour * 60 + hora_actual.minute
    alerta_creada = False
    alerta_tipo = ''
    alerta_titulo = ''
    alerta_mensaje = ''

    if tipo == 'ENTRADA':
        target = 720  # 12:00 md
        if turno_detectado == 'Corrido 2' or (turno_detectado == 'Desconocido' and mins_marcados > 810):
            target = 900  # 3:00 pm
        diff = mins_marcados - target
        if diff > 10:  # Tolerancia
            alerta_creada = True
            alerta_tipo = 'TARDANZA'
            alerta_titulo = f"Tardanza detectada: {empleado.nombre} {empleado.apellido}"
            alerta_mensaje = f"Llegó {diff} minutos tarde. Marcaje a las {hora_actual.strftime('%I:%M %p')} (Turno {turno_detectado})."
            
    elif tipo == 'ENTRADA_QUEBRADA':
        target = 1080  # 6:00 pm
        diff = mins_marcados - target
        if diff > 10:
            alerta_creada = True
            alerta_tipo = 'TARDANZA'
            alerta_titulo = f"Tardanza en regreso: {empleado.nombre} {empleado.apellido}"
            alerta_mensaje = f"Regresó de la pausa {diff} minutos tarde. Marcaje a las {hora_actual.strftime('%I:%M %p')}."
            
    elif tipo == 'SALIDA_QUEBRADA':
        target = 900  # 3:00 pm
        diff = target - mins_marcados
        if diff > 5:
            alerta_creada = True
            alerta_tipo = 'SALIDA_ANTICIPADA'
            alerta_titulo = f"Salida anticipada Pausa: {empleado.nombre} {empleado.apellido}"
            alerta_mensaje = f"Se retiró a la pausa {diff} minutos antes de tiempo. Marcaje a las {hora_actual.strftime('%I:%M %p')}."
            
    elif tipo == 'SALIDA_DEFINITIVA':
        target = 1380  # 11:00 pm
        if turno_detectado == 'Corrido 1':
            target = 1200  # 8:00 pm
        
        diff = target - mins_marcados
        if diff > 5:
            alerta_creada = True
            alerta_tipo = 'SALIDA_ANTICIPADA'
            alerta_titulo = f"Salida definitiva anticipada: {empleado.nombre} {empleado.apellido}"
            alerta_mensaje = f"Salió {diff} minutos antes de tiempo. Marcaje a las {hora_actual.strftime('%I:%M %p')} (Turno {turno_detectado})."

    if alerta_creada:
        AlertaAsistencia.objects.create(
            tipo=alerta_tipo,
            empleado=empleado,
            titulo=alerta_titulo,
            mensaje=alerta_mensaje
        )

if __name__ == '__main__':
    simulate()
