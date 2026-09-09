from rest_framework import serializers
from .models import Empleado, RegistroAsistencia, BitacoraAccion, DiaFeriado, AutorizacionHorasExtra, AlertaAsistencia, PermisoAusencia, CompensacionHoras


class EmpleadoSimpleSerializer(serializers.ModelSerializer):
    cargo_display = serializers.CharField(source='get_cargo_display', read_only=True)
    tipo_turno_display = serializers.CharField(source='get_tipo_turno_display', read_only=True)

    class Meta:
        model = Empleado
        fields = [
            'id',
            'nombre',
            'apellido',
            'cargo',
            'cargo_display',
            'tipo_turno',
            'tipo_turno_display',
            'cedula_carnet',
            'telefono',
            'qr_code_token',
            'activo',
            'horas_pendientes',
        ]


class EmpleadoSerializer(serializers.ModelSerializer):
    cargo_display = serializers.CharField(source='get_cargo_display', read_only=True)
    tipo_turno_display = serializers.CharField(source='get_tipo_turno_display', read_only=True)
    dias_vacaciones_tomadas = serializers.SerializerMethodField()
    dias_vacaciones_disponibles = serializers.SerializerMethodField()

    class Meta:
        model = Empleado
        fields = [
            'id',
            'nombre',
            'apellido',
            'cargo',
            'cargo_display',
            'tipo_turno',
            'tipo_turno_display',
            'cedula_carnet',
            'telefono',
            'qr_code_token',
            'activo',
            'horas_pendientes',
            'periodo_horas_pendientes',
            'dias_vacaciones_acumuladas',
            'ultimo_corte_vacaciones',
            'dias_vacaciones_tomadas',
            'dias_vacaciones_disponibles',
            'created_at',
            'updated_at',
        ]

    def get_dias_vacaciones_tomadas(self, obj):
        if hasattr(obj, '_vacaciones_tomadas_cache'):
            return obj._vacaciones_tomadas_cache
        try:
            permisos = obj.permisos.all()
            total = sum(
                p.total_dias for p in permisos
                if p.tipo in ('VACACIONES', 'VACACIONES_PAGADAS')
                or (p.tipo == 'PERMISO_AUTORIZADO' and 'vacaciones' in (p.motivo or '').lower())
            )
            val = round(float(total), 2)
            obj._vacaciones_tomadas_cache = val
            return val
        except Exception:
            return 0.0

    def get_dias_vacaciones_disponibles(self, obj):
        try:
            acumuladas = float(obj.dias_vacaciones_acumuladas or 0.0)
            tomadas = self.get_dias_vacaciones_tomadas(obj)
            return round(acumuladas - tomadas, 2)
        except Exception:
            return 0.0


class RegistroAsistenciaSerializer(serializers.ModelSerializer):
    empleado_detalle = EmpleadoSimpleSerializer(source='empleado', read_only=True)
    tipo_evento_display = serializers.CharField(source='get_tipo_evento_display', read_only=True)
    foto_verificacion_url = serializers.SerializerMethodField()

    class Meta:
        model = RegistroAsistencia
        fields = [
            'id',
            'empleado',
            'empleado_detalle',
            'tipo_evento',
            'tipo_evento_display',
            'fecha_hora',
            'foto_verificacion',
            'foto_verificacion_url',
            'observacion',
            'ip_address',
        ]

    def get_foto_verificacion_url(self, obj):
        if obj.foto_base64:
            return obj.foto_base64
        if obj.foto_verificacion:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.foto_verificacion.url)
            return obj.foto_verificacion.url
        return None


class BitacoraAccionSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.SerializerMethodField()
    accion_display = serializers.CharField(source='get_accion_display', read_only=True)

    class Meta:
        model = BitacoraAccion
        fields = [
            'id',
            'usuario',
            'usuario_nombre',
            'accion',
            'accion_display',
            'descripcion',
            'ip_address',
            'fecha_hora',
        ]

    def get_usuario_nombre(self, obj):
        if obj.usuario:
            return f"{obj.usuario.first_name} {obj.usuario.last_name}".strip() or obj.usuario.username
        return 'Sistema / Kiosco'


class DiaFeriadoSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiaFeriado
        fields = ['id', 'fecha', 'descripcion']


class AutorizacionHorasExtraSerializer(serializers.ModelSerializer):
    empleado_detalle = EmpleadoSimpleSerializer(source='empleado', read_only=True)

    class Meta:
        model = AutorizacionHorasExtra
        fields = [
            'id',
            'empleado',
            'empleado_detalle',
            'fecha',
            'horas_extra_solicitadas',
            'horas_extra_autorizadas',
            'estado',
            'comentario',
            'created_at',
            'updated_at',
        ]


class AlertaAsistenciaSerializer(serializers.ModelSerializer):
    empleado_detalle = EmpleadoSimpleSerializer(source='empleado', read_only=True)

    class Meta:
        model = AlertaAsistencia
        fields = ['id', 'tipo', 'empleado', 'empleado_detalle', 'titulo', 'mensaje', 'leida', 'created_at']


class PermisoAusenciaSerializer(serializers.ModelSerializer):
    empleado_detalle = EmpleadoSimpleSerializer(source='empleado', read_only=True)
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    total_dias = serializers.ReadOnlyField()

    class Meta:
        model = PermisoAusencia
        fields = [
            'id',
            'empleado',
            'empleado_detalle',
            'tipo',
            'tipo_display',
            'fecha_inicio',
            'fecha_fin',
            'motivo',
            'total_dias',
            'created_at',
        ]


class CompensacionHorasSerializer(serializers.ModelSerializer):
    empleado_detalle = EmpleadoSimpleSerializer(source='empleado', read_only=True)

    class Meta:
        model = CompensacionHoras
        fields = [
            'id',
            'empleado',
            'empleado_detalle',
            'fecha_compensacion',
            'horas_trabajadas_hoy',
            'horas_extra_generadas',
            'horas_deducidas',
            'deuda_previa',
            'saldo_restante',
            'remanente_extra',
            'desglose',
            'created_at',
        ]
