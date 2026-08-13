import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone


class Empleado(models.Model):
    CARGOS_CHOICES = [
        ('COCINA', 'Cocinero / Ayudante de Cocina'),
        ('MESERO', 'Mesero / Garzón'),
        ('CAJERO', 'Cajero'),
        ('BARMAN', 'Barman'),
        ('LIMPIEZA', 'Mantenimiento y Limpieza'),
        ('ADMINISTRACION', 'Administración / Gerencia'),
    ]

    nombre = models.CharField(max_length=100)
    apellido = models.CharField(max_length=100)
    cargo = models.CharField(max_length=50, choices=CARGOS_CHOICES, default='MESERO')
    TURNO_CHOICES = [
        ('CORRIDO', 'Horario Corrido'),
        ('QUEBRADO', 'Horario Quebrado'),
    ]
    tipo_turno = models.CharField(max_length=20, choices=TURNO_CHOICES, default='CORRIDO')
    cedula_carnet = models.CharField(max_length=50, blank=True, null=True)
    telefono = models.CharField(max_length=20, blank=True, null=True)
    tarifa_hora = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, help_text="Tarifa en Córdobas/USD por hora trabajada")
    qr_code_token = models.CharField(max_length=150, unique=True, blank=True)
    activo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['nombre', 'apellido']

    def __str__(self):
        return f"{self.nombre} {self.apellido} ({self.get_cargo_display()})"

    def save(self, *args, **kwargs):
        if not self.qr_code_token:
            self.qr_code_token = str(uuid.uuid4())
        
        token_str = str(self.qr_code_token)
        if '.' not in token_str:
            import hmac
            import hashlib
            signature = hmac.new(
                settings.SECRET_KEY.encode('utf-8'),
                token_str.encode('utf-8'),
                hashlib.sha256
            ).hexdigest()[:16]
            self.qr_code_token = f"{token_str}.{signature}"
            
        super().save(*args, **kwargs)


class RegistroAsistencia(models.Model):
    TIPO_EVENTO_CHOICES = [
        ('ENTRADA', '🟢 Entrada (Inicio de Jornada)'),
        ('SALIDA_QUEBRADA', '🟡 Salida a Horario Quebrado (Pausa)'),
        ('ENTRADA_QUEBRADA', '🔵 Entrada de Horario Quebrado (Retorno)'),
        ('SALIDA_DEFINITIVA', '🔴 Salida Definitiva (Fin de Jornada)'),
    ]

    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE, related_name='registros_asistencia')
    tipo_evento = models.CharField(max_length=30, choices=TIPO_EVENTO_CHOICES)
    fecha_hora = models.DateTimeField(default=timezone.now)
    foto_verificacion = models.ImageField(upload_to='asistencia_fotos/', blank=True, null=True)
    observacion = models.TextField(blank=True, null=True)
    ip_address = models.CharField(max_length=45, blank=True, null=True)

    class Meta:
        ordering = ['-fecha_hora', '-id']

    def __str__(self):
        nicaragua_tz = timezone.get_current_timezone()
        local_dt = self.fecha_hora.astimezone(nicaragua_tz)
        return f"[{local_dt.strftime('%d/%m/%Y %H:%M')}] {self.empleado.nombre} - {self.get_tipo_evento_display()}"


class BitacoraAccion(models.Model):
    ACCIONES = [
        ('CREAR_EMPLEADO', 'Crear Empleado'),
        ('EDITAR_EMPLEADO', 'Editar Empleado'),
        ('ELIMINAR_EMPLEADO', 'Eliminar Empleado'),
        ('REGISTRO_MANUAL', 'Registro Manual de Asistencia'),
        ('EXPORTAR_NOMINA', 'Exportar Nómina / Reporte Excel'),
    ]

    usuario = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    accion = models.CharField(max_length=50, choices=ACCIONES)
    descripcion = models.TextField()
    ip_address = models.CharField(max_length=45, blank=True, null=True)
    fecha_hora = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_hora']

    def __str__(self):
        user_str = self.usuario.username if self.usuario else 'Sistema / Kiosco'
        return f"[{self.fecha_hora.strftime('%d/%m/%Y %H:%M')}] {user_str} - {self.get_accion_display()}"


class DiaFeriado(models.Model):
    fecha = models.DateField(unique=True)
    descripcion = models.CharField(max_length=150)

    class Meta:
        ordering = ['-fecha']

    def __str__(self):
        return f"{self.fecha.strftime('%d/%m/%Y')} - {self.descripcion}"


class AutorizacionHorasExtra(models.Model):
    ESTADOS = [
        ('PENDIENTE', 'Pendiente'),
        ('APROBADO', 'Aprobado'),
        ('RECHAZADO', 'Rechazado'),
    ]

    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE, related_name='autorizaciones_horas_extra')
    fecha = models.DateField()
    horas_extra_solicitadas = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    horas_extra_autorizadas = models.DecimalField(max_digits=5, decimal_places=2, default=0.00)
    estado = models.CharField(max_length=20, choices=ESTADOS, default='PENDIENTE')
    comentario = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-fecha', 'empleado']
        unique_together = ('empleado', 'fecha')

    def __str__(self):
        return f"{self.fecha.strftime('%d/%m/%Y')} - {self.empleado.nombre}: {self.horas_extra_autorizadas}h ({self.get_estado_display()})"


class AlertaAsistencia(models.Model):
    TIPOS = [
        ('TARDANZA', 'Tardanza'),
        ('SALIDA_ANTICIPADA', 'Salida Anticipada'),
        ('MARCACION_SOSPECHOSA', 'Marcación Sospechosa'),
    ]
    tipo = models.CharField(max_length=30, choices=TIPOS)
    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE, related_name='alertas')
    titulo = models.CharField(max_length=150)
    mensaje = models.TextField()
    leida = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"[{self.tipo}] {self.titulo} - {'Leída' if self.leida else 'Pendiente'}"
