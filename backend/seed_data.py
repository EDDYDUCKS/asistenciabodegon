import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'sgp_asistencia.settings')
django.setup()

from asistencia.models import Empleado

empleados_iniciales = [
    {
        'nombre': 'Carlos',
        'apellido': 'Mendoza',
        'cargo': 'COCINA',
        'cedula_carnet': '001-150895-1002K',
        'telefono': '8888-1111',
        'tarifa_hora': 45.00,
    },
    {
        'nombre': 'María',
        'apellido': 'García',
        'cargo': 'MESERO',
        'cedula_carnet': '001-200598-1005A',
        'telefono': '8888-2222',
        'tarifa_hora': 40.00,
    },
    {
        'nombre': 'Roberto',
        'apellido': 'López',
        'cargo': 'CAJERO',
        'cedula_carnet': '001-101092-1008P',
        'telefono': '8888-3333',
        'tarifa_hora': 50.00,
    },
    {
        'nombre': 'Ana',
        'apellido': 'Torres',
        'cargo': 'LIMPIEZA',
        'cedula_carnet': '001-050490-1001M',
        'telefono': '8888-4444',
        'tarifa_hora': 35.00,
    },
    {
        'nombre': 'Don Mario',
        'apellido': 'Polla',
        'cargo': 'ADMINISTRACION',
        'cedula_carnet': '001-010170-1000A',
        'telefono': '8888-9999',
        'tarifa_hora': 75.00,
    },
]

print("Creando empleados de prueba para El Bodegon...")
for data in empleados_iniciales:
    emp, created = Empleado.objects.get_or_create(
        nombre=data['nombre'],
        apellido=data['apellido'],
        defaults=data
    )
    status = "Creado" if created else "Ya existia"
    print(f" -> {emp.nombre} {emp.apellido} ({emp.get_cargo_display()}) - Token QR: {emp.qr_code_token} [{status}]")

print("\nEmpleados iniciales cargados con exito.")
