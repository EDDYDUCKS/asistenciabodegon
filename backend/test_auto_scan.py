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
from asistencia.models import Empleado, RegistroAsistencia

def run_auto_scan_test():
    print("====================================================")
    print("[TEST DE ESCANEO AUTOMATICO] PROBANDO SECUENCIA KIOSCO")
    print("====================================================")
    
    # 1. Obtener empleados
    carlos = Empleado.objects.filter(tipo_turno='QUEBRADO').first()
    eddy = Empleado.objects.filter(tipo_turno='CORRIDO').first()
    
    if not carlos or not eddy:
        print("Error: No se encontraron empleados con turnos QUEBRADO y CORRIDO para la prueba.")
        return
        
    c = Client()
    
    # ── PRUEBA 1: CARLOS MENDOZA (Turno Quebrado - Cocina) ─────────────────
    print(f"\nProbando secuencia para {carlos.nombre} {carlos.apellido} (Turno: {carlos.get_tipo_turno_display()}):")
    
    # Limpiar marcajes de hoy para Carlos
    hoy = timezone.localdate()
    RegistroAsistencia.objects.filter(empleado=carlos, fecha_hora__date=hoy).delete()
    print("-> Marcajes de hoy limpiados para Carlos.")
    
    # Simular 4 escaneos consecutivos
    scan_times = [
        datetime.datetime.combine(hoy, datetime.time(12, 0, 0)),  # Scan 1: 12md (Entrada)
        datetime.datetime.combine(hoy, datetime.time(15, 0, 0)),  # Scan 2: 3pm (Salida Pausa)
        datetime.datetime.combine(hoy, datetime.time(18, 0, 0)),  # Scan 3: 6pm (Regreso Pausa)
        datetime.datetime.combine(hoy, datetime.time(23, 0, 0)),  # Scan 4: 11pm (Salida Definitiva)
    ]
    
    for i, t in enumerate(scan_times, 1):
        t_iso = timezone.make_aware(t, timezone.get_current_timezone()).isoformat()
        response = c.post('/api/kiosco/marcar/', {
            'qr_token': carlos.qr_code_token,
            'fecha_hora': t_iso
        })
        if response.status_code == 200:
            data = response.json()
            reg_type = data['registro']['tipo_evento']
            msg = data['mensaje']
            print(f"   Scan {i} ({t.strftime('%I:%M %p')}): Auto-detectado como -> {reg_type} | {msg}")
        else:
            print(f"   Scan {i} falló: {response.content.decode()}")

    # ── PRUEBA 2: EDDY MARTINEZ (Turno Corrido - Cajero) ────────────────────
    print(f"\nProbando secuencia para {eddy.nombre} {eddy.apellido} (Turno: {eddy.get_tipo_turno_display()}):")
    
    # Limpiar marcajes de hoy para Eddy
    RegistroAsistencia.objects.filter(empleado=eddy, fecha_hora__date=hoy).delete()
    print("-> Marcajes de hoy limpiados para Eddy.")
    
    # Simular 2 escaneos consecutivos
    scan_times_eddy = [
        datetime.datetime.combine(hoy, datetime.time(12, 0, 0)),  # Scan 1: 12md (Entrada)
        datetime.datetime.combine(hoy, datetime.time(20, 0, 0)),  # Scan 2: 8pm (Salida Definitiva)
    ]
    
    for i, t in enumerate(scan_times_eddy, 1):
        t_iso = timezone.make_aware(t, timezone.get_current_timezone()).isoformat()
        response = c.post('/api/kiosco/marcar/', {
            'qr_token': eddy.qr_code_token,
            'fecha_hora': t_iso
        })
        if response.status_code == 200:
            data = response.json()
            reg_type = data['registro']['tipo_evento']
            msg = data['mensaje']
            print(f"   Scan {i} ({t.strftime('%I:%M %p')}): Auto-detectado como -> {reg_type} | {msg}")
        else:
            print(f"   Scan {i} falló: {response.content.decode()}")
            
    print("\n====================================================")
    print("PRUEBA DE SECUENCIA FINALIZADA CON EXITO")
    print("====================================================")

if __name__ == '__main__':
    run_auto_scan_test()
