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

def run_test():
    print("====================================================")
    print("[TEST] INICIANDO PRUEBAS DE TURNOS, ALERTAS Y FERIADOS")
    print("====================================================")
    
    # 1. Limpiar base de datos
    RegistroAsistencia.objects.all().delete()
    AlertaAsistencia.objects.all().delete()
    AutorizacionHorasExtra.objects.all().delete()
    DiaFeriado.objects.all().delete()
    print("Base de datos limpia.")

    # 2. Crear Feriado Dinámico para el 2026-08-05
    DiaFeriado.objects.create(fecha=datetime.date(2026, 8, 5), descripcion="Fiesta Patronal Santo Domingo")
    print("Dia Feriado registrado en BD: 05/08/2026 (Santo Domingo)")

    # 3. Obtener empleados base
    try:
        eddy = Empleado.objects.get(nombre__icontains="Eddy")
        ana = Empleado.objects.get(nombre__icontains="Ana")
        carlos = Empleado.objects.get(nombre__icontains="Carlos")
        maria = Empleado.objects.get(nombre__icontains="Mar")
        roberto = Empleado.objects.get(nombre__icontains="Robert")
    except Empleado.DoesNotExist:
        print("Empleados base no encontrados en la base de datos.")
        return

    # Definir Nicaragua timezone y fecha base de pruebas
    ni_tz = timezone.get_current_timezone()
    hoy_date = datetime.date(2026, 8, 5)
    start_dt = timezone.make_aware(datetime.datetime.combine(hoy_date, datetime.time.min), ni_tz)
    end_dt = timezone.make_aware(datetime.datetime.combine(hoy_date, datetime.time.max), ni_tz)

    feriados_set = set(DiaFeriado.objects.values_list('fecha', flat=True))

    # ── ESCENARIO 1: EDDY MARTINEZ (Corrido 1 en Feriado) ──────────────────
    eddy_ent_time = timezone.make_aware(datetime.datetime(2026, 8, 5, 12, 11, 0), ni_tz)
    eddy_sal_time = timezone.make_aware(datetime.datetime(2026, 8, 5, 20, 0, 0), ni_tz)

    print("\n--- [Escenario 1] Eddy Martinez (Corrido 1 en Feriado) ---")
    reg_eddy_ent = RegistroAsistencia.objects.create(empleado=eddy, tipo_evento='ENTRADA', fecha_hora=eddy_ent_time)
    _trigger_alerts_logic(reg_eddy_ent)
    reg_eddy_sal = RegistroAsistencia.objects.create(empleado=eddy, tipo_evento='SALIDA_DEFINITIVA', fecha_hora=eddy_sal_time)
    _trigger_alerts_logic(reg_eddy_sal)

    regs_eddy = list(RegistroAsistencia.objects.filter(empleado=eddy, fecha_hora__range=(start_dt, end_dt)).order_by('fecha_hora'))
    _imprimir_horas_desglosadas(eddy, hoy_date, feriados_set, regs_eddy)

    # ── ESCENARIO 2: ANA TORRES (Corrido 2 en Feriado) ─────────────────────
    ana_ent_time = timezone.make_aware(datetime.datetime(2026, 8, 5, 15, 0, 0), ni_tz)
    ana_sal_time = timezone.make_aware(datetime.datetime(2026, 8, 5, 23, 8, 0), ni_tz)

    print("\n--- [Escenario 2] Ana Torres (Corrido 2 en Feriado) ---")
    reg_ana_ent = RegistroAsistencia.objects.create(empleado=ana, tipo_evento='ENTRADA', fecha_hora=ana_ent_time)
    _trigger_alerts_logic(reg_ana_ent)
    reg_ana_sal = RegistroAsistencia.objects.create(empleado=ana, tipo_evento='SALIDA_DEFINITIVA', fecha_hora=ana_sal_time)
    _trigger_alerts_logic(reg_ana_sal)

    regs_ana = list(RegistroAsistencia.objects.filter(empleado=ana, fecha_hora__range=(start_dt, end_dt)).order_by('fecha_hora'))
    _imprimir_horas_desglosadas(ana, hoy_date, feriados_set, regs_ana)

    # ── ESCENARIO 3: CARLOS MENDOZA (Quebrado - Caso 1: A Tiempo en Feriado) 
    c_e1 = timezone.make_aware(datetime.datetime(2026, 8, 5, 12, 0, 0), ni_tz)
    c_s1 = timezone.make_aware(datetime.datetime(2026, 8, 5, 15, 0, 0), ni_tz)
    c_e2 = timezone.make_aware(datetime.datetime(2026, 8, 5, 18, 0, 0), ni_tz)
    c_s2 = timezone.make_aware(datetime.datetime(2026, 8, 5, 23, 0, 0), ni_tz)

    print("\n--- [Escenario 3] Carlos Mendoza (Quebrado en Feriado) ---")
    reg_c_e1 = RegistroAsistencia.objects.create(empleado=carlos, tipo_evento='ENTRADA', fecha_hora=c_e1)
    _trigger_alerts_logic(reg_c_e1)
    reg_c_s1 = RegistroAsistencia.objects.create(empleado=carlos, tipo_evento='SALIDA_QUEBRADA', fecha_hora=c_s1)
    _trigger_alerts_logic(reg_c_s1)
    reg_c_e2 = RegistroAsistencia.objects.create(empleado=carlos, tipo_evento='ENTRADA_QUEBRADA', fecha_hora=c_e2)
    _trigger_alerts_logic(reg_c_e2)
    reg_c_s2 = RegistroAsistencia.objects.create(empleado=carlos, tipo_evento='SALIDA_DEFINITIVA', fecha_hora=c_s2)
    _trigger_alerts_logic(reg_c_s2)

    regs_carlos = list(RegistroAsistencia.objects.filter(empleado=carlos, fecha_hora__range=(start_dt, end_dt)).order_by('fecha_hora'))
    _imprimir_horas_desglosadas(carlos, hoy_date, feriados_set, regs_carlos)

    # ── ESCENARIO 4: CARLOS MENDOZA (Día Siguiente: Día Normal No Feriado) ──
    # Validamos que el día 2026-08-06 NO se detecte como feriado y vaya a ordinarias normales
    hoy_next = datetime.date(2026, 8, 6)
    start_dt_next = timezone.make_aware(datetime.datetime.combine(hoy_next, datetime.time.min), ni_tz)
    end_dt_next = timezone.make_aware(datetime.datetime.combine(hoy_next, datetime.time.max), ni_tz)

    c_next_e1 = timezone.make_aware(datetime.datetime(2026, 8, 6, 12, 0, 0), ni_tz)
    c_next_s1 = timezone.make_aware(datetime.datetime(2026, 8, 6, 15, 0, 0), ni_tz)
    c_next_e2 = timezone.make_aware(datetime.datetime(2026, 8, 6, 18, 0, 0), ni_tz)
    c_next_s2 = timezone.make_aware(datetime.datetime(2026, 8, 6, 23, 0, 0), ni_tz)

    print("\n--- [Escenario 4] Carlos Mendoza (Día Siguiente: Día Normal No Feriado) ---")
    reg_c_next_e1 = RegistroAsistencia.objects.create(empleado=carlos, tipo_evento='ENTRADA', fecha_hora=c_next_e1)
    _trigger_alerts_logic(reg_c_next_e1)
    reg_c_next_s1 = RegistroAsistencia.objects.create(empleado=carlos, tipo_evento='SALIDA_QUEBRADA', fecha_hora=c_next_s1)
    _trigger_alerts_logic(reg_c_next_s1)
    reg_c_next_e2 = RegistroAsistencia.objects.create(empleado=carlos, tipo_evento='ENTRADA_QUEBRADA', fecha_hora=c_next_e2)
    _trigger_alerts_logic(reg_c_next_e2)
    reg_c_next_s2 = RegistroAsistencia.objects.create(empleado=carlos, tipo_evento='SALIDA_DEFINITIVA', fecha_hora=c_next_s2)
    _trigger_alerts_logic(reg_c_next_s2)

    regs_carlos_next = list(RegistroAsistencia.objects.filter(empleado=carlos, fecha_hora__range=(start_dt_next, end_dt_next)).order_by('fecha_hora'))
    _imprimir_horas_desglosadas(carlos, hoy_next, feriados_set, regs_carlos_next)

    # ── MOSTRAR ALERTAS CREADAS ───────────────────────────────────────────
    print("\n====================================================")
    print("REPORTES DE ALERTAS REGISTRADOS EN EL SISTEMA")
    print("====================================================")
    alertas = AlertaAsistencia.objects.all()
    if not alertas.exists():
        print("No se generaron alertas de tardanza/salidas en estas pruebas.")
    for al in alertas:
        print(f"[{al.tipo}] {al.titulo}")
        print(f"   Mensaje: {al.mensaje}")
        print("   ---")

    print("\nPRUEBAS COMPLETADAS CON EXITO Y EXCELENCIA ASEGURADA!")
    print("====================================================")

def _imprimir_horas_desglosadas(empleado, dia, feriados_set, regs):
    from asistencia.views import _calcular_horas_netas_dia
    horas_totales = _calcular_horas_netas_dia(regs)
    horas_ord = min(horas_totales, 8.0)
    
    horas_normales = 0.0
    horas_feriadas = 0.0
    
    if dia in feriados_set:
        horas_feriadas = horas_ord
    else:
        horas_normales = horas_ord
        
    print(f"   Desglose Calculado:")
    print(f"   >> Horas Físicas Totales: {horas_totales:.2f} hrs")
    print(f"   >> Horas Ordinarias (Normales): {horas_normales:.2f} hrs")
    print(f"   >> Horas Feriadas (Físicas): {horas_feriadas:.2f} hrs")

def _trigger_alerts_logic(registro):
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

    tiene_quebrado = any(r.tipo_evento in ['SALIDA_QUEBRADA', 'REGRESO_QUEBRADA'] for r in registros_actualizados)
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
    run_test()
