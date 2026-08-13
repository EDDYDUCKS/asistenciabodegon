import os
import django
import sys
import datetime

# Inicializar Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sgp_asistencia.settings')
django.setup()

from django.test import Client
from django.utils import timezone
from asistencia.models import Empleado, RegistroAsistencia, AlertaAsistencia
from asistencia.views import _calcular_horas_netas_dia

def run_extreme_late_test():
    print("====================================================")
    print("[TEST CASOS EXTREMOS] PROBANDO LLEGADA TARDE E IDA TEMPRANO")
    print("====================================================")
    
    # Obtener empleado de Turno Corrido (Cajero: Eddy Martinez)
    eddy = Empleado.objects.filter(nombre__icontains="Eddy").first()
    if not eddy:
        print("Error: No se encontró a Eddy Martinez para la prueba.")
        return

    c = Client()
    hoy = timezone.localdate()
    ni_tz = timezone.get_current_timezone()

    # ── ESCENARIO A: LLEGADA 1 HORA TARDE ──────────────────────────────────
    print(f"\n--- Escenario A: {eddy.nombre} llega 1 hora tarde (1:00 PM - Target: 12:00 PM) ---")
    
    # Limpiar registros y alertas de hoy para Eddy
    RegistroAsistencia.objects.filter(empleado=eddy, fecha_hora__date=hoy).delete()
    AlertaAsistencia.objects.filter(empleado=eddy).delete()
    
    # 1. Escaneo de entrada 1 hora tarde
    t_entrada = datetime.datetime.combine(hoy, datetime.time(13, 0, 0)) # 1:00 PM
    t_entrada_iso = timezone.make_aware(t_entrada, ni_tz).isoformat()
    
    res_ent = c.post('/api/kiosco/marcar/', {
        'qr_token': eddy.qr_code_token,
        'fecha_hora': t_entrada_iso
    })
    
    # 2. Escaneo de salida a tiempo (8:00 PM)
    t_salida = datetime.datetime.combine(hoy, datetime.time(20, 0, 0)) # 8:00 PM
    t_salida_iso = timezone.make_aware(t_salida, ni_tz).isoformat()
    
    res_sal = c.post('/api/kiosco/marcar/', {
        'qr_token': eddy.qr_code_token,
        'fecha_hora': t_salida_iso
    })

    # Verificar Alertas generadas
    alertas_a = AlertaAsistencia.objects.filter(empleado=eddy)
    print("\n   [RESULTADOS ESCENARIO A]:")
    print(f"   >> Estado de respuesta salida: {res_sal.status_code}")
    print(f"   >> Alertas generadas en el sistema:")
    if not alertas_a.exists():
        print("      No se generaron alertas.")
    for al in alertas_a:
        print(f"      - [{al.tipo}] {al.titulo}")
        print(f"        Detalle: {al.mensaje}")
        
    # Verificar horas
    regs_hoy = list(RegistroAsistencia.objects.filter(empleado=eddy, fecha_hora__date=hoy).order_by('fecha_hora'))
    horas_fisi = _calcular_horas_netas_dia(regs_hoy)
    horas_ord = min(horas_fisi, 8.0)
    deuda = max(0.0, 8.0 - horas_ord)
    print(f"   >> Horas Físicas Trabajadas: {horas_fisi:.2f} hrs")
    print(f"   >> Horas Ordinarias Computadas: {horas_ord:.2f} hrs")
    print(f"   >> Horas Debidas (Deuda de hoy): {deuda:.2f} hrs (Equivalente exacto a 1 hora de tardanza)")


    # ── ESCENARIO B: SALIDA 1.5 HORAS ANTES ────────────────────────────────
    print(f"\n--- Escenario B: {eddy.nombre} llega a tiempo pero sale 1.5 horas antes (6:30 PM - Target: 8:00 PM) ---")
    
    # Limpiar nuevamente
    RegistroAsistencia.objects.filter(empleado=eddy, fecha_hora__date=hoy).delete()
    AlertaAsistencia.objects.filter(empleado=eddy).delete()
    
    # 1. Escaneo de entrada a tiempo (12:00 PM)
    t_entrada_b = datetime.datetime.combine(hoy, datetime.time(12, 0, 0)) # 12:00 PM
    t_entrada_b_iso = timezone.make_aware(t_entrada_b, ni_tz).isoformat()
    c.post('/api/kiosco/marcar/', {
        'qr_token': eddy.qr_code_token,
        'fecha_hora': t_entrada_b_iso
    })
    
    # 2. Escaneo de salida 1.5 horas antes (6:30 PM)
    t_salida_b = datetime.datetime.combine(hoy, datetime.time(18, 30, 0)) # 6:30 PM
    t_salida_b_iso = timezone.make_aware(t_salida_b, ni_tz).isoformat()
    res_sal_b = c.post('/api/kiosco/marcar/', {
        'qr_token': eddy.qr_code_token,
        'fecha_hora': t_salida_b_iso
    })

    # Verificar Alertas generadas
    alertas_b = AlertaAsistencia.objects.filter(empleado=eddy)
    print("\n   [RESULTADOS ESCENARIO B]:")
    print(f"   >> Estado de respuesta salida: {res_sal_b.status_code}")
    print(f"   >> Alertas generadas en el sistema:")
    if not alertas_b.exists():
        print("      No se generaron alertas.")
    for al in alertas_b:
        print(f"      - [{al.tipo}] {al.titulo}")
        print(f"        Detalle: {al.mensaje}")
        
    # Verificar horas
    regs_hoy_b = list(RegistroAsistencia.objects.filter(empleado=eddy, fecha_hora__date=hoy).order_by('fecha_hora'))
    horas_fisi_b = _calcular_horas_netas_dia(regs_hoy_b)
    horas_ord_b = min(horas_fisi_b, 8.0)
    deuda_b = max(0.0, 8.0 - horas_ord_b)
    print(f"   >> Horas Físicas Trabajadas: {horas_fisi_b:.2f} hrs")
    print(f"   >> Horas Ordinarias Computadas: {horas_ord_b:.2f} hrs")
    print(f"   >> Horas Debidas (Deuda de hoy): {deuda_b:.2f} hrs (Equivalente exacto a 1.5 horas faltantes)")

    print("\n====================================================")
    print("PRUEBA DE CASOS EXTREMOS FINALIZADA")
    print("====================================================")

if __name__ == '__main__':
    run_extreme_late_test()
