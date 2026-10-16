from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('asistencia', '0020_alter_alertaasistencia_tipo'),
    ]

    operations = [
        migrations.AddField(
            model_name='permisoausencia',
            name='dias_descanso_semanal',
            field=models.IntegerField(default=0, help_text='Días de descanso semanal que caen dentro del período de vacaciones (no se deducen del saldo)'),
        ),
    ]
