from rest_framework import serializers
from .models import Empleado, RegistroAsistencia, BitacoraAccion, DiaFeriado, AutorizacionHorasExtra, AlertaAsistencia


class EmpleadoSerializer(serializers.ModelSerializer):
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
            'created_at',
            'updated_at',
        ]


class RegistroAsistenciaSerializer(serializers.ModelSerializer):
    empleado_detalle = EmpleadoSerializer(source='empleado', read_only=True)
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
    empleado_detalle = EmpleadoSerializer(source='empleado', read_only=True)

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
    empleado_detalle = EmpleadoSerializer(source='empleado', read_only=True)

    class Meta:
        model = AlertaAsistencia
        fields = ['id', 'tipo', 'empleado', 'empleado_detalle', 'titulo', 'mensaje', 'leida', 'created_at']
