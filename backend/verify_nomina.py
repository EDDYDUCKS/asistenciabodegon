import os
import django
import sys
import datetime

# Inicializar Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sgp_asistencia.settings')
django.setup()

from django.utils import timezone
from asistencia.models import Empleado, RegistroAsistencia, DiaFeriado, AutorizacionHorasExtra

def verify():
    print("====================================================")
    print("[VERIFICACION] BALANCE DE NOMINA POR RANGO (01 AL 15 AGOSTO 2026)")
    print("====================================================")
    
    fecha_inicio = datetime.date(2026, 8, 1)
    fecha_fin = datetime.date(2026, 8, 15)
    
    feriados_set = set(DiaFeriado.objects.filter(
        fecha__gte=fecha_inicio,
        fecha__lte=fecha_fin
    ).values_list('fecha', flat=True))
    
    print(f"Feriados en el rango: {list(feriados_set)}\n")

    empleados = Empleado.objects.filter(activo=True)
    from asistencia.views import _calcular_horas_netas_dia
    
    for emp in empleados:
        start_query = timezone.make_aware(datetime.datetime.combine(fecha_inicio, datetime.time.min), timezone.get_current_timezone())
        end_query = timezone.make_aware(datetime.datetime.combine(fecha_fin, datetime.time.max), timezone.get_current_timezone())
        
        registros = RegistroAsistencia.objects.filter(
            empleado=emp,
            fecha_hora__range=(start_query, end_query)
        ).order_by('fecha_hora')
        
        horas_normales_trabajadas = 0.0
        feriados_trabajados_dias = 0
        horas_debidas = 0.0
        feriados_detalles = []
        dias_map = {}
        for reg in registros:
            reg_local = reg.fecha_hora.astimezone(timezone.get_current_timezone())
            dia_local = reg_local.date()
            if dia_local < fecha_inicio or dia_local > fecha_fin:
                continue
            if dia_local not in dias_map:
                dias_map[dia_local] = []
            dias_map[dia_local].append(reg)
            
        dias_unicos = len(dias_map)
            
        for dia, regs in dias_map.items():
            # Ordenar por fecha_hora
            regs.sort(key=lambda r: r.fecha_hora)
            horas_dia = _calcular_horas_netas_dia(regs)
            horas_ord = min(horas_dia, 8.0)
            
            if dia in feriados_set:
                if horas_ord >= 8.0:
                    feriados_trabajados_dias += 1
                    desc_fer = DiaFeriado.objects.filter(fecha=dia).first()
                    feriados_detalles.append(f"  - Feriado {dia}: {desc_fer.descripcion if desc_fer else 'Feriado'} ({round(horas_ord, 2)} hrs) -> Completado")
                else:
                    feriados_detalles.append(f"  - Feriado {dia}: {desc_fer.descripcion if desc_fer else 'Feriado'} ({round(horas_ord, 2)} hrs) -> INCUMPLIDO (< 8.0h, simples)")
                    horas_normales_trabajadas += horas_ord
            else:
                horas_normales_trabajadas += horas_ord

        # Calcular horas debidas recorriendo cada día laborable normal del período
        horas_debidas = 0.0
        curr_day = fecha_inicio
        while curr_day <= fecha_fin:
            if curr_day.weekday() != 6 and curr_day not in feriados_set:
                if curr_day in dias_map:
                    regs = dias_map[curr_day]
                    regs.sort(key=lambda r: r.fecha_hora)
                    horas_dia = _calcular_horas_netas_dia(regs)
                    horas_ord = min(horas_dia, 8.0)
                    deuda_dia = max(0.0, 8.0 - horas_ord)
                    horas_debidas += deuda_dia
                else:
                    # Ausencia completa
                    horas_debidas += 8.0
            curr_day += datetime.timedelta(days=1)

        from django.db.models import Sum
        horas_extra_aprobadas = AutorizacionHorasExtra.objects.filter(
            empleado=emp,
            fecha__gte=fecha_inicio,
            fecha__lte=fecha_fin,
            estado='APROBADO'
        ).aggregate(total=Sum('horas_extra_autorizadas'))['total'] or 0.0
        
        horas_extra_pendientes = AutorizacionHorasExtra.objects.filter(
            empleado=emp,
            fecha__gte=fecha_inicio,
            fecha__lte=fecha_fin,
            estado='PENDIENTE'
        ).aggregate(total=Sum('horas_extra_solicitadas'))['total'] or 0.0

        print(f"Empleado: {emp.nombre} {emp.apellido} ({emp.get_cargo_display()} - Turno: {emp.get_tipo_turno_display()})")
        print(f"  Dias Asistidos (Marcaje): {dias_unicos}")
        print(f"  Horas Ordinarias (Normales): {horas_normales_trabajadas:.2f} hrs")
        print(f"  Feriados Trabajados (Días): {feriados_trabajados_dias} dia(s)")
        if feriados_detalles:
            print("\n".join(feriados_detalles))
        print(f"  Horas Extra: Aprobadas = {horas_extra_aprobadas:.2f} hrs | Pendientes = {horas_extra_pendientes:.2f} hrs")
        print(f"  Horas Debidas (Faltantes): {horas_debidas:.2f} hrs")
        print("-" * 50)
    
    print("====================================================")

if __name__ == '__main__':
    verify()
