import os
import sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, HRFlowable, Image
)
from reportlab.pdfgen import canvas

# ─────────────────────────────────────────────────────────────────────────────
# PALETA DE COLOR CORPORATIVA EL BODEGÓN PASS
# ─────────────────────────────────────────────────────────────────────────────
COLOR_PRIMARY       = colors.HexColor('#1c6856') # Esmeralda Bodegón
COLOR_PRIMARY_DARK  = colors.HexColor('#134e42') # Verde Oscuro Profundo
COLOR_PRIMARY_LIGHT = colors.HexColor('#e8f5f1') # Verde pastel fondo
COLOR_ACCENT        = colors.HexColor('#d97706') # Ámbar / Dorado
COLOR_ACCENT_LIGHT  = colors.HexColor('#fef3c7') # Ámbar pastel
COLOR_DANGER        = colors.HexColor('#be123c') # Rojo alerta
COLOR_DANGER_LIGHT  = colors.HexColor('#ffe4e6') # Rosa pastel
COLOR_INFO          = colors.HexColor('#2563eb') # Azul información
COLOR_INFO_LIGHT    = colors.HexColor('#eff6ff') # Azul pastel
COLOR_DARK          = colors.HexColor('#1c1917') # Stone 900
COLOR_TEXT          = colors.HexColor('#292524') # Stone 800
COLOR_MUTED         = colors.HexColor('#78716c') # Stone 500
COLOR_BORDER        = colors.HexColor('#e7e5e4') # Stone 200
COLOR_BG_ALT        = colors.HexColor('#f8fafc') # Gris fondo alterno

class NumberedCanvas(canvas.Canvas):
    """
    Canvas en dos pasadas para calcular dinámicamente el número total de páginas
    y estampar encabezado institucional y pie con 'Página X de Y'.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, total_pages):
        # La portada (Pág. 1) no lleva encabezado ni pie
        if self._pageNumber == 1:
            return

        self.saveState()
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(COLOR_PRIMARY_DARK)

        # Encabezado (Header)
        self.drawString(54, letter[1] - 34, "EL BODEGÓN PASS  •  MANUAL COMPLETO DE USUARIO Y OPERACIONES")
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(COLOR_ACCENT)
        self.drawRightString(letter[0] - 54, letter[1] - 34, "GUÍA GERENCIAL & ADMINISTRATIVA")

        self.setStrokeColor(COLOR_BORDER)
        self.setLineWidth(0.75)
        self.line(54, letter[1] - 40, letter[0] - 54, letter[1] - 40)

        # Pie de página (Footer)
        self.line(54, 45, letter[0] - 54, 45)
        self.setFont("Helvetica", 7.5)
        self.setFillColor(COLOR_MUTED)
        self.drawString(54, 32, "Restaurante & Bar El Bodegón  •  Control de Asistencia, Biometría, Nómina y Horas Extra")
        page_str = f"Página {self._pageNumber} de {total_pages}"
        self.setFont("Helvetica-Bold", 7.5)
        self.setFillColor(COLOR_DARK)
        self.drawRightString(letter[0] - 54, 32, page_str)

        self.restoreState()

def build_pdf_manual(output_path):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()

    # Tipografías y Jerarquías de Texto
    cover_title_style = ParagraphStyle(
        'CoverTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=24,
        leading=30,
        textColor=colors.white,
        alignment=1,
    )

    cover_sub_style = ParagraphStyle(
        'CoverSub',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#d1fae5'),
        alignment=1,
    )

    h1_style = ParagraphStyle(
        'H1',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=COLOR_PRIMARY_DARK,
        spaceBefore=14,
        spaceAfter=6,
        keepWithNext=True
    )

    h2_style = ParagraphStyle(
        'H2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=COLOR_PRIMARY,
        spaceBefore=10,
        spaceAfter=4,
        keepWithNext=True
    )

    h3_style = ParagraphStyle(
        'H3',
        parent=styles['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=COLOR_DARK,
        spaceBefore=7,
        spaceAfter=3,
        keepWithNext=True
    )

    body_style = ParagraphStyle(
        'Body',
        parent=styles['BodyText'],
        fontName='Helvetica',
        fontSize=9,
        leading=13.5,
        textColor=COLOR_TEXT,
        spaceAfter=5,
    )

    body_bold = ParagraphStyle(
        'BodyBold',
        parent=body_style,
        fontName='Helvetica-Bold',
    )

    bullet_style = ParagraphStyle(
        'Bullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=COLOR_TEXT,
        leftIndent=14,
        firstLineIndent=-10,
        spaceAfter=3,
    )

    step_style = ParagraphStyle(
        'Step',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13.5,
        textColor=COLOR_TEXT,
        leftIndent=18,
        firstLineIndent=-14,
        spaceAfter=4,
    )

    callout_text = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=COLOR_DARK,
    )

    table_th_style = ParagraphStyle(
        'Th',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=10.5,
        textColor=colors.white,
    )

    table_td_style = ParagraphStyle(
        'Td',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10.5,
        textColor=COLOR_TEXT,
    )

    story = []

    # Rutas a imágenes del sistema
    base_dir = os.path.dirname(os.path.abspath(__file__))
    assets_dir = os.path.join(base_dir, 'manual_assets')
    public_dir = os.path.join(base_dir, '../../frontend/public')

    logo_path = os.path.join(public_dir, 'logo-emblem.png')
    logo_full_path = os.path.join(public_dir, 'logo.png')

    def box_alert(text, title="NOTA IMPORTANTE", style="info"):
        bg = COLOR_PRIMARY_LIGHT if style == "info" else (COLOR_ACCENT_LIGHT if style == "warning" else (COLOR_DANGER_LIGHT if style == "danger" else COLOR_INFO_LIGHT))
        bcolor = COLOR_PRIMARY if style == "info" else (COLOR_ACCENT if style == "warning" else (COLOR_DANGER if style == "danger" else COLOR_INFO))
        content = [
            [Paragraph(f"<b>{title}</b>", ParagraphStyle('BoxT', parent=callout_text, fontName='Helvetica-Bold', textColor=bcolor, fontSize=9))],
            [Paragraph(text, callout_text)]
        ]
        t = Table(content, colWidths=[504])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), bg),
            ('BOX', (0,0), (-1,-1), 1, bcolor),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ]))
        return t

    def image_figure(filename, caption, width=5.2*inch, height=2.6*inch):
        img_path = os.path.join(assets_dir, filename)
        if not os.path.exists(img_path):
            return Spacer(1, 2)
        im = Image(img_path, width=width, height=height)
        cap = Paragraph(f"<i>Figura: {caption}</i>", ParagraphStyle('Cap', parent=styles['Normal'], fontName='Helvetica-Oblique', fontSize=7.5, leading=9, textColor=COLOR_MUTED, alignment=1))
        content = [[im], [cap]]
        t = Table(content, colWidths=[504])
        t.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 3),
            ('BOTTOMPADDING', (0,0), (-1,-1), 3),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ]))
        return t

    # ═════════════════════════════════════════════════════════════════════════
    # 1. PORTADA EJECUTIVA
    # ═════════════════════════════════════════════════════════════════════════
    banner_data = [
        [Paragraph("<font size=9 color='#d1fae5'><b>MANUAL OFICIAL DE USUARIO, OPERACIONES Y ADMINISTRACIÓN</b></font>", cover_sub_style)],
        [Paragraph("EL BODEGÓN PASS", cover_title_style)],
        [Paragraph("Sistema Integral de Asistencia Biométrica, Nómina, Horas Extra y Control de Piso", ParagraphStyle('CSub2', parent=cover_sub_style, fontName='Helvetica-Bold', fontSize=13, textColor=colors.HexColor('#fde047')))],
        [Paragraph("Restaurante & Bar El Bodegón • Versión Operativa 2.0 • Edición 2026", cover_sub_style)]
    ]
    banner_table = Table(banner_data, colWidths=[504])
    banner_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), COLOR_PRIMARY),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 16),
        ('BOTTOMPADDING', (0,0), (-1,-1), 16),
        ('LEFTPADDING', (0,0), (-1,-1), 15),
        ('RIGHTPADDING', (0,0), (-1,-1), 15),
    ]))
    story.append(banner_table)
    story.append(Spacer(1, 18))

    if os.path.exists(logo_path):
        story.append(Image(logo_path, width=1.6*inch, height=1.6*inch))
    story.append(Spacer(1, 15))

    meta_rows = [
        [Paragraph("<b>Documento:</b>", body_bold), Paragraph("Manual de Instrucciones Operativas y Políticas de Control Laboral", body_style)],
        [Paragraph("<b>Destinatarios:</b>", body_bold), Paragraph("Administradores de Turno, Gerencia General, Propietario y Contabilidad", body_style)],
        [Paragraph("<b>Objetivo:</b>", body_bold), Paragraph("Servir de guía exhaustiva para la operación diaria del Kiosco, la auditoría biométrica, la gestión de horas extra con PIN 2322, el cálculo estricto de nómina y el control de vacaciones.", body_style)],
        [Paragraph("<b>Seguridad:</b>", body_bold), Paragraph("Acceso Restringido. Contiene procedimientos con PIN Maestro <b>2322</b> y PIN Administrativo <b>4512</b>.", body_style)],
        [Paragraph("<b>Plataforma:</b>", body_bold), Paragraph("Next.js 16 (Turbopack), Django REST Framework, PostgreSQL, FaceAPI Biométrico.", body_style)],
    ]
    meta_tbl = Table(meta_rows, colWidths=[110, 394])
    meta_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), COLOR_PRIMARY_LIGHT),
        ('BOX', (0,0), (-1,-1), 1.2, COLOR_PRIMARY),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 20))

    story.append(Paragraph(
        "<i>«Cualquier persona que asuma la administración o supervisión en El Bodegón debe leer y aplicar este manual para mantener la exactitud de los tiempos, la justicia laboral y el cumplimiento de la ley.»</i>",
        ParagraphStyle('Quotes', parent=body_style, fontName='Helvetica-Oblique', alignment=1, textColor=COLOR_MUTED)
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # 2. ÍNDICE DETALLADO
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("ÍNDICE GENERAL DEL MANUAL", h1_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    toc_items = [
        ("Capítulo 1", "Introducción General, Arquitectura del Sistema y Roles", "Pág. 3"),
        ("Capítulo 2", "Guía Operativa del Kiosco Biométrico (Punto de Entrada)", "Pág. 4"),
        ("Capítulo 3", "Panel de Monitoreo en Tiempo Real (Supervisión Diaria)", "Pág. 6"),
        ("Capítulo 4", "Gestión Integral de Horas Extra (Aprobación, PIN 2322 y Boleta)", "Pág. 7"),
        ("Capítulo 5", "Cuadro de Nómina y Reportes de Horas (Sticky, Áreas y Vistas)", "Pág. 9"),
        ("Capítulo 6", "Vacaciones, Permisos y Feriados Legales (Código del Trabajo)", "Pág. 11"),
        ("Capítulo 7", "Gestión de Colaboradores, Enrolamiento Facial y Carnets QR", "Pág. 12"),
        ("Capítulo 8", "Políticas de Bolsa de Horas y Control Gerencial de Deducciones", "Pág. 13"),
        ("Capítulo 9", "Bodegón Control (Compras, Gastos y Flujo Operativo)", "Pág. 14"),
        ("Capítulo 10", "Seguridad, Copias de Respaldo y Mantenimiento de Base de Datos", "Pág. 14"),
        ("Capítulo 11", "Guía de Resolución de Incidencias Frecuentes (Troubleshooting)", "Pág. 15"),
        ("Capítulo 12", "Checklist de Responsabilidades del Administrador y del Jefe", "Pág. 16"),
    ]
    toc_table_data = []
    for cap, desc, pg in toc_items:
        toc_table_data.append([
            Paragraph(f"<b>{cap}</b>", body_bold),
            Paragraph(desc, body_style),
            Paragraph(pg, body_bold)
        ])
    toc_tbl = Table(toc_table_data, colWidths=[80, 360, 64])
    toc_tbl.setStyle(TableStyle([
        ('LINEBELOW', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(toc_tbl)
    story.append(Spacer(1, 10))

    story.append(box_alert(
        "<b>Convenciones de Lectura:</b> En este documento los botones de la pantalla se indican entre corchetes <b>[Botón]</b>, "
        "las rutas de navegación web en código <code>/ruta</code> y las claves de seguridad en negrita sombreada.",
        "CÓMO USAR ESTA GUÍA",
        "info"
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 1: INTRODUCCIÓN GENERAL Y ARQUITECTURA
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 1: INTRODUCCIÓN, ARQUITECTURA Y ROLES", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("1.1 Filosofía de Control de El Bodegón Pass", h2_style))
    story.append(Paragraph(
        "<b>El Bodegón Pass</b> no es solo un reloj marcador; es el núcleo administrativo del restaurante que garantiza que "
        "cada minuto laborado sea registrado con veracidad, que las horas extra sean autorizadas de manera consciente por la gerencia, "
        "y que las prestaciones sociales (vacaciones y feriados) se cumplan de conformidad con las leyes laborales de la República de Nicaragua.",
        body_style
    ))
    story.append(Paragraph(
        "El sistema erradica tres problemas históricos comunes en la industria gastronómica:<br/>"
        "1. <b>El 'amiguismo' en los marcajes:</b> Nadie puede marcar por otro porque el reconocimiento facial y la fotografía de auditoría registran a la persona real frente a la cámara.<br/>"
        "2. <b>El descontrol de horas extra:</b> Ninguna hora adicional se paga si no cuenta con la previsualización y autorización mediante el PIN Maestro <b>2322</b>.<br/>"
        "3. <b>La pérdida de días feriados y vacaciones:</b> El sistema acredita automáticamente los feriados trabajados y los días acumulados.",
        body_style
    ))

    story.append(Paragraph("1.2 Claves Maestras y Credenciales del Sistema", h2_style))
    story.append(Paragraph(
        "Para evitar confusiones operativas, todo el personal administrativo debe memorizar las dos claves del sistema:",
        body_style
    ))
    pins_data = [
        [Paragraph("Código PIN", table_th_style), Paragraph("Uso y Nivel de Autoridad", table_th_style), Paragraph("¿Quién debe conocerlo?", table_th_style)],
        [
            Paragraph("<b>4512</b>", table_td_style),
            Paragraph("<b>PIN de Entrada al Panel Administrativo:</b> Permite ingresar al panel <code>/admin</code> desde cualquier navegador. Da acceso a empleados, asistencia diaria y nómina.", table_td_style),
            Paragraph("Administrador de Turno y Gerencia General.", table_td_style)
        ],
        [
            Paragraph("<b>2322</b>", table_td_style),
            Paragraph("<b>PIN Maestro de Horas Extra:</b> Desbloquea la aprobación o rechazo de horas extra en <code>/admin/nomina</code>. Su digitación es instantánea (0 lag) y genera la boleta oficial.", table_td_style),
            Paragraph("Exclusivo de Propietario / Gerente General.", table_td_style)
        ],
        [
            Paragraph("<b>PIN Personal (4 dígitos)</b>", table_td_style),
            Paragraph("<b>PIN de Colaborador:</b> Permite al empleado marcar en el Kiosco si la cámara no lo reconoce por iluminación o uso de accesorios.", table_td_style),
            Paragraph("Cada colaborador conoce solo su propio PIN.", table_td_style)
        ],
    ]
    pins_tbl = Table(pins_data, colWidths=[90, 274, 140])
    pins_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, COLOR_BG_ALT]),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(pins_tbl)
    story.append(Spacer(1, 8))

    story.append(Paragraph("1.3 Matriz de Roles: Responsabilidades del Administrador vs. El Jefe", h2_style))
    roles_matrix = [
        [Paragraph("Tarea Operativa", table_th_style), Paragraph("Administrador de Turno", table_th_style), Paragraph("Jefe / Gerente General", table_th_style)],
        [Paragraph("Vigilar Kiosco y limpieza de cámara", table_td_style), Paragraph("<b>Responsable directo</b> al iniciar turno.", table_td_style), Paragraph("Audita aleatoriamente.", table_td_style)],
        [Paragraph("Monitorear personal presente (/control)", table_td_style), Paragraph("<b>Obligatorio:</b> verificar ausencias y tardanzas.", table_td_style), Paragraph("Consulta global de asistencia.", table_td_style)],
        [Paragraph("Cerrar turnos huérfanos (11 PM)", table_td_style), Paragraph("<b>Ejecuta</b> si alguien olvidó marcar salida.", table_td_style), Paragraph("Revisa justificación al día siguiente.", table_td_style)],
        [Paragraph("Aprobar Horas Extra (PIN 2322)", table_td_style), Paragraph("Previsualiza y sugiere justificación.", table_td_style), Paragraph("<b>Autoriza formalmente</b> con PIN 2322.", table_td_style)],
        [Paragraph("Emitir Boletas de Vacaciones en dinero", table_td_style), Paragraph("Prepara solicitud del empleado.", table_td_style), Paragraph("<b>Autoriza y firma</b> el comprobante.", table_td_style)],
        [Paragraph("Descargar Planilla Quincenal en Excel", table_td_style), Paragraph("Apoya en la revisión de asistencias.", table_td_style), Paragraph("<b>Descarga y envía</b> a pago bancario.", table_td_style)],
        [Paragraph("Respaldar Base de Datos (Backup JSON)", table_td_style), Paragraph("N/A", table_td_style), Paragraph("<b>Descarga quincenal</b> de seguridad.", table_td_style)],
    ]
    roles_tbl = Table(roles_matrix, colWidths=[150, 174, 180])
    roles_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY_DARK),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, COLOR_BG_ALT]),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(roles_tbl)

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 2: KIOSCO BIOMÉTRICO
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 2: GUÍA OPERATIVA DEL KIOSCO BIOMÉTRICO", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "El Kiosco es el dispositivo frontal (generalmente una Tablet Android o iPad montada en pared) donde los trabajadores "
        "registran sus entradas, pausas y salidas. Está disponible permanentemente en la ruta <code>/kiosco</code>.",
        body_style
    ))

    # Imagen del Kiosco
    story.append(image_figure("kiosco_marcador.png", "Pantalla Principal del Kiosco con Marcaje Facial y Opciones de Marcaje", height=2.2*inch))
    story.append(Spacer(1, 6))

    story.append(Paragraph("2.1 Cómo Marcar Asistencia: Paso a Paso para el Colaborador", h2_style))
    story.append(Paragraph("<b>Paso 1: Posicionamiento:</b> El trabajador se coloca frente a la tablet a una distancia de 50 a 60 centímetros, mirando al lente de la cámara.", step_style))
    story.append(Paragraph("<b>Paso 2: Reconocimiento Facial:</b> La pantalla dibuja un recuadro verde sobre el rostro del colaborador y muestra su nombre completo inmediatamente (ej. <i>'¡Hola, Carlos Eduardo!'</i>).", step_style))
    story.append(Paragraph("<b>Paso 3: Selección del Tipo de Marcaje:</b> El colaborador pulsa sobre el botón que corresponda a su momento laboral:", step_style))
    story.append(Paragraph("   • <b>[ ENTRADA ]:</b> Se oprime al iniciar el turno. Enciende el cronómetro laboral.", bullet_style))
    story.append(Paragraph("   • <b>[ INICIO COMIDA ]:</b> Se oprime al sentarse a almorzar o cenar. Detiene temporalmente el cómputo de horas.", bullet_style))
    story.append(Paragraph("   • <b>[ FIN COMIDA ]:</b> Se oprime al reincorporarse a las labores de piso o cocina.", bullet_style))
    story.append(Paragraph("   • <b>[ SALIDA ]:</b> Se oprime al terminar el turno definitivo del día.", bullet_style))
    story.append(Paragraph("<b>Paso 4: Confirmación en Pantalla:</b> El Kiosco emite un sonido agradable de confirmación y muestra la pantalla verde de éxito con el resumen del evento registrado.", step_style))

    story.append(Spacer(1, 4))
    story.append(image_figure("kiosco_exito.png", "Confirmación Exitosa de Marcaje en Pantalla con Foto de Evidencia", height=2.0*inch))
    story.append(Spacer(1, 4))

    story.append(Paragraph("2.2 Alternativa de Respaldo: Marcaje con PIN Personal", h2_style))
    story.append(Paragraph(
        "Si por alguna razón la cámara web no detecta el rostro del trabajador (por ejemplo, si el salón está en penumbra, "
        "si el colaborador usa gafas de sol, vendas o mascarilla):",
        body_style
    ))
    story.append(Paragraph("1. Pulsar el botón <b>[ Ingresar con PIN ]</b> ubicado abajo de la cámara.", step_style))
    story.append(Paragraph("2. En el teclado digital en pantalla, digitar los <b>4 números de su PIN personal</b>.", step_style))
    story.append(Paragraph("3. El sistema cargará el perfil del colaborador, tomará la foto de auditoría y le permitirá marcar normalmente.", step_style))

    story.append(Paragraph("2.3 Reglas Matemáticas Inflexibles del Kiosco", h2_style))
    story.append(Paragraph(
        "El Administrador y el Jefe deben conocer de memoria las dos reglas automáticas que aplica el Kiosco al pulsar <b>[SALIDA]</b>:",
        body_style
    ))
    story.append(Paragraph(
        "<b>REGLA 1: Cero Tolerancia en Salidas Anticipadas (Déficit a Bolsa de Horas):</b><br/>"
        "La jornada ordinaria completa en El Bodegón es de <b>8.0 horas netas</b>. Si un colaborador marca su salida a las 7.5 horas laboradas "
        "(ej. 30 minutos antes), el sistema calcula el déficit exacto: <code>8.0 - 7.5 = 0.5 hrs</code>. "
        "Ese tiempo se suma de inmediato a su saldo de <b>Bolsa de Horas</b> (<code>horas_pendientes</code>) y genera una notificación gerencial. "
        "<b>El sistema nunca borra ni recorta solicitudes de horas extra pendientes a ciegas.</b>",
        body_style
    ))
    story.append(Paragraph(
        "<b>REGLA 2: Umbral de 30 Minutos para Horas Extra:</b><br/>"
        "Para evitar cobros por tiempos muertos o demoras involuntarias al ponerse el uniforme, las horas extra **solo se activan a partir de 30 minutos (0.5 hrs) laborados por encima de las 8 horas normales**.<br/>"
        "• Si un empleado labora <b>8 horas con 15 minutos</b>: no se generan horas extra; su turno cierra en 8.0 horas normales.<br/>"
        "• Si labora <b>8 horas con 35 minutos</b>: se genera automáticamente una Solicitud de <b>0.5 horas extra</b>.<br/>"
        "• Si labora <b>9 horas con 05 minutos</b>: se genera una Solicitud de <b>1.0 hora extra</b>.<br/>"
        "<i>Los cómputos de horas extra siempre se realizan en intervalos limpios de 30 minutos (0.5, 1.0, 1.5, 2.0 hrs).</i>",
        body_style
    ))

    story.append(box_alert(
        "<b>Limpieza de Lente:</b> Una vez por turno, el Administrador debe pasar un paño suave de microfibra por el lente de la cámara del Kiosco. "
        "La grasa de cocina ambiental sobre el lente es la causa #1 de fallas en el reconocimiento facial.",
        "MANTENIMIENTO DEL KIOSCO",
        "warning"
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 3: PANEL DE MONITOREO EN TIEMPO REAL
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 3: MONITOREO EN TIEMPO REAL (CONTROL DE PISO)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "El Administrador y el Jefe pueden supervisar la asistencia en vivo ingresando desde cualquier teléfono móvil, tablet o PC "
        "a la ruta <code>/admin/asistencia</code> o a la consola rápida <code>/control</code>.",
        body_style
    ))

    story.append(Paragraph("3.1 Lectura del Semáforo de Asistencia", h2_style))
    story.append(Paragraph(
        "La pantalla de Asistencia de Hoy agrupa al personal en 4 cuadrantes claramente diferenciados:",
        body_style
    ))
    status_data = [
        [Paragraph("Estado", table_th_style), Paragraph("Color / Badge", table_th_style), Paragraph("Significado Operativo", table_th_style), Paragraph("Acción Requerida", table_th_style)],
        [
            Paragraph("<b>Presente</b>", table_td_style),
            Paragraph("Verde Esmeralda", table_td_style),
            Paragraph("El colaborador marcó Entrada y está trabajando activamente en su puesto.", table_td_style),
            Paragraph("Ninguna. Operación normal.", table_td_style)
        ],
        [
            Paragraph("<b>En Almuerzo</b>", table_td_style),
            Paragraph("Ámbar / Naranja", table_td_style),
            Paragraph("El colaborador pausó su turno para comer. Muestra los minutos transcurridos.", table_td_style),
            Paragraph("Verificar que no exceda su tiempo acordado de descanso.", table_td_style)
        ],
        [
            Paragraph("<b>Salida Registrada</b>", table_td_style),
            Paragraph("Gris / Azul", table_td_style),
            Paragraph("El colaborador completó su turno y se retiró de las instalaciones.", table_td_style),
            Paragraph("Verificar que las horas netas correspondan a su horario.", table_td_style)
        ],
        [
            Paragraph("<b>Ausente</b>", table_td_style),
            Paragraph("Rojo / Alerta", table_td_style),
            Paragraph("Empleado programado que no registra ningún marcaje de entrada en el día.", table_td_style),
            Paragraph("Contactar al empleado para investigar causa (enfermedad o falta injustificada).", table_td_style)
        ],
    ]
    status_tbl = Table(status_data, colWidths=[90, 80, 184, 150])
    status_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, COLOR_BG_ALT]),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(status_tbl)
    story.append(Spacer(1, 8))

    story.append(Paragraph("3.2 Auditoría Visual: Consulta de Fotografías de Marcaje", h2_style))
    story.append(Paragraph(
        "Al hacer clic sobre cualquier registro en la tabla de asistencia, se despliega la <b>Ficha de Auditoría Biométrica</b> que contiene:",
        body_style
    ))
    story.append(Paragraph("• La fotografía real tomada por la cámara frontal en el momento exacto del marcaje.", bullet_style))
    story.append(Paragraph("• La marca de tiempo con hora, minuto y segundo sincronizada con el servidor.", bullet_style))
    story.append(Paragraph("• La dirección IP del dispositivo para verificar que se marcó desde la tablet del local y no remotamente.", bullet_style))

    story.append(Paragraph("3.3 Procedimiento Nocturno: Cierre de Turnos Huérfanos (11:00 PM)", h2_style))
    story.append(Paragraph(
        "En ocasiones un colaborador termina su turno y olvida marcar su Salida en el Kiosco. "
        "A las 11:00 PM, el sistema detecta estos casos y genera una alerta de <code>REGISTRO_INCOMPLETO</code> en la campanita.<br/>"
        "<b>Para resolverlo limpiamente:</b><br/>"
        "1. El Administrador hace clic en la campanita de alertas en la barra superior.<br/>"
        "2. Ubica la alerta del colaborador con marcaje abierto.<br/>"
        "3. Presiona el botón <b>[ 🌙 Cerrar 11:00 PM ]</b>.<br/>"
        "4. El sistema sella automáticamente la salida a las 23:00 hrs de esa noche, evitando que el cronómetro siga contando horas al día siguiente.",
        body_style
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 4: GESTIÓN INTEGRAL DE HORAS EXTRA
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 4: GESTIÓN DE HORAS EXTRA (PIN 2322 & BOLETAS)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "El módulo de Horas Extra en <code>/admin/nomina</code> (pestaña 'Horas Extra') es una de las herramientas más importantes "
        "para el control financiero del restaurante. En esta sección se auditan, autorizan, liquidan y archivan los tiempos suplementarios.",
        body_style
    ))

    # Imagen de Horas Extra Pendientes
    story.append(image_figure("horas_extra_pendientes.png", "Listado de Solicitudes Pendientes con Previsualización y Botones de Aprobación", height=2.2*inch))
    story.append(Spacer(1, 6))

    story.append(Paragraph("4.1 Estructura en 5 Sub-Pestañas", h2_style))
    story.append(Paragraph("1. <b>Pendientes:</b> Horas trabajadas por encima de 8h detectadas por el Kiosco que esperan autorización gerencial.", bullet_style))
    story.append(Paragraph("2. <b>Por Pagar (Aprobadas):</b> Horas que ya fueron aprobadas con el PIN 2322 y están en fila para liquidarse en la nómina.", bullet_style))
    story.append(Paragraph("3. <b>Pagadas:</b> Historial de horas extra que ya fueron liquidadas con su respectivo recibo o boleta pagada.", bullet_style))
    story.append(Paragraph("4. <b>Historial Completo:</b> Registro de todas las solicitudes evaluadas con filtro por Aprobado o Rechazado.", bullet_style))
    story.append(Paragraph("5. <b>Compensaciones:</b> Registro histórico de deducciones aplicadas por salidas anticipadas.", bullet_style))

    story.append(Paragraph("4.2 Procedimiento de Aprobación Paso a Paso", h2_style))
    story.append(Paragraph("<b>Paso 1: Identificación de la Solicitud:</b> Ingrese a <code>/admin/nomina</code> y pulse la pestaña <b>Horas Extra</b>. En la sub-pestaña <b>Pendientes</b> verá el badge amarillo con el conteo de solicitudes pendientes.", step_style))
    story.append(Paragraph("<b>Paso 2: Previsualización Detallada:</b> Cada fila muestra el nombre del colaborador, la fecha del turno, la hora de entrada y salida, las horas ordinarias cumplidas y las <b>Horas Solicitadas</b>.", step_style))
    story.append(Paragraph("<b>Paso 3: Verificación del Límite del Art. 58:</b> Si el colaborador tiene el distintivo <code>⚠️ >9h sem (Art. 58)</code>, significa que al aprobar esa solicitud superará el límite legal de 9 horas semanales del Código del Trabajo de Nicaragua. El Jefe debe evaluar si reasigna turnos para no incurrir en riesgos laborales.", step_style))
    story.append(Paragraph("<b>Paso 4: Pulsar [Aprobar] o [Rechazar]:</b>", step_style))
    story.append(Paragraph("   • Si se pulsa <b>[Aprobar]</b>: Se puede ajustar la cifra (ejemplo: solicitó 2.0h pero solo se le autorizan 1.5h) y escribir un comentario opcional.", bullet_style))
    story.append(Paragraph("   • Si se pulsa <b>[Rechazar]</b>: Es obligatorio ingresar el motivo del rechazo para transparencia con el colaborador.", bullet_style))
    story.append(Paragraph("<b>Paso 5: Ingreso del PIN Maestro 2322:</b> Se desplegará el modal de seguridad interactivo. Digite en pantalla o en el teclado numérico el código <b>2322</b>. El modal responde al instante (0 ms de lag) y se cierra con confirmación verde.", step_style))
    story.append(Paragraph("<b>Paso 6: Apertura Automática de la Boleta Oficial:</b> Si fue aprobada, la pantalla abrirá de inmediato la <b>Boleta Oficial de Horas Extra</b>.", step_style))

    story.append(PageBreak())

    # Boleta Oficial
    story.append(Paragraph("4.3 La Boleta Oficial de Horas Extra", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(image_figure("boleta_horas_extra.png", "Boleta Oficial de Horas Extra (BHE) con Folio Único y Desglose Financiero", height=2.3*inch))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        "Toda hora extra aprobada genera un documento formal con número correlativo único (ejemplo: <code>BHE-2026-0038</code>). "
        "Este comprobante cuenta con validez legal interna y contiene:",
        body_style
    ))
    story.append(Paragraph("• <b>Encabezado Oficial:</b> Logotipo de El Bodegón, RUC comercial, folio correlativo y fecha de emisión.", bullet_style))
    story.append(Paragraph("• <b>Datos del Trabajador:</b> Nombre completo, número de cédula, cargo y salario base por hora.", bullet_style))
    story.append(Paragraph("• <b>Auditoría Biométrica:</b> Horas exactas de entrada y salida marcadas en el Kiosco.", bullet_style))
    story.append(Paragraph("• <b>Liquidación Económica:</b> Cantidad de horas autorizadas, recargo legal obligatorio al 100% (tarifa doble) y monto total a pagar en Córdobas (C$).", bullet_style))
    story.append(Paragraph("• <b>Espacios de Firma:</b> Línea de firma para el Administrador/Gerente y línea de firma para el Colaborador.", bullet_style))

    story.append(Paragraph("4.4 Protocolo de Liquidación Quincenal", h2_style))
    story.append(Paragraph(
        "El día de cierre de quincena (días 15 y último de mes), el Administrador debe:<br/>"
        "1. Ir a la sub-pestaña <b>Por Pagar (Aprobadas)</b>.<br/>"
        "2. Revisar la suma consolidada de horas y montos por cada trabajador.<br/>"
        "3. Pulsar <b>[ Emitir Recibo de Pago ]</b> para liquidar el importe junto con el salario de la planilla.<br/>"
        "4. Al emitirse el pago, las horas se transfieren automáticamente a la sub-pestaña <b>Pagadas</b> para archivo definitivo.",
        body_style
    ))

    story.append(box_alert(
        "<b>Impresión Física:</b> Se recomienda imprimir la boleta con el botón <b>[Imprimir]</b> y hacer que el colaborador la firme "
        "el día de la entrega del pago. Esto protege a la empresa ante cualquier reclamo posterior.",
        "BUENA PRÁCTICA LABORAL",
        "info"
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 5: CUADRO DE NÓMINA Y REPORTES
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 5: CUADRO DE NÓMINA Y REPORTES DE HORAS", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "El Cuadro de Nómina en <code>/admin/nomina</code> (pestaña 'Reporte de Horas') es el corazón del control quincenal. "
        "Reúne en una sola vista toda la actividad laboral de cada uno de los colaboradores.",
        body_style
    ))

    # Imagen del Cuadro de Nómina
    story.append(image_figure("nomina_cuadro.png", "Cuadro Ejecutivo de Nómina con Columna Sticky, Filtros por Área y Selector de Vistas", height=2.2*inch))
    story.append(Spacer(1, 6))

    story.append(Paragraph("5.1 Características de Navegación Rápida", h2_style))
    story.append(Paragraph(
        "Para facilitar la lectura en pantallas de laptops, computadoras de escritorio o tablets, el cuadro incluye tres herramientas clave:",
        body_style
    ))
    story.append(Paragraph("• <b>Columna de Empleado Fija (Sticky Column):</b> Al desplazarse horizontalmente por las 10 columnas, el nombre y cargo del colaborador permanecen fijos en el lateral izquierdo, permitiendo ver las cifras sin perder de vista a quién corresponden.", bullet_style))
    story.append(Paragraph("• <b>Encabezados y Fila de Totales Fijos:</b> Al desplazarse hacia abajo en la lista de trabajadores, los nombres de columna y los totales generales del período quedan fijos en la parte superior e inferior.", bullet_style))
    story.append(Paragraph("• <b>Filtros por Área Operativa:</b> Botones superiores con contadores en tiempo real para filtrar la vista instantáneamente en: <i>Todos, 🍳 Cocina & Parrilla, 🍽️ Salón & Servicio, 🍸 Caja & Barra, 🧹 Operaciones, y ⭐ Gerencia</i>.", bullet_style))
    story.append(Paragraph("• <b>Conmutador de Vistas:</b> Permite alternar entre <b>[Tabla Detallada]</b> (modo análisis contable) y <b>[Vista Tarjetas]</b> (tarjetas individuales para consulta rápida en dispositivos táctiles).", bullet_style))

    story.append(Paragraph("5.2 Selector de Quincena Rápida", h2_style))
    story.append(Paragraph(
        "En lugar de escribir manualmente las fechas de inicio y fin, el Administrador puede presionar el botón <b>[Planilla Quincenal]</b> "
        "y seleccionar una de las tres opciones automáticas:<br/>"
        "• <b>1ra Quincena:</b> Del 01 al 15 del mes actual.<br/>"
        "• <b>2da Quincena:</b> Del 16 al último día del mes actual (28, 30 o 31).<br/>"
        "• <b>Quincena Anterior:</b> La quincena inmediata previa para auditoría o pagos rezagados.",
        body_style
    ))

    story.append(PageBreak())

    story.append(Paragraph("5.3 Significado y Reglas de las 10 Columnas del Cuadro", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(image_figure("cuadro_horas_detalle.png", "Detalle de Columnas de Horas Ordinarias, Feriados, Vacaciones y Horas Extra", height=1.5*inch))
    story.append(Spacer(1, 4))

    col_details = [
        ("1. Empleado y Puesto", "Muestra el nombre completo, el cargo oficial y los distintivos de permisos o incapacidades médicas vigentes."),
        ("2. Días Trabajados", "Total de días dentro del rango en los que el colaborador registra marcaje válido de Entrada y Salida."),
        ("3. Días Libres", "Días de descanso semanal tomados en el período. Si el empleado asistió en su día libre, el sistema lo computa como trabajado."),
        ("4. Horas Ordinarias", "Suma neta de horas regulares laboradas (hasta un máximo de 8.0 horas por turno ordinario)."),
        ("5. Feriados Trabajados", "Cantidad de días feriados oficiales laborados. Muestra el badge <b>+2d vac.</b> indicando la compensación legal acreditada."),
        ("6. Vacaciones Pagadas", "Días de vacaciones que han sido liquidados en dinero en el período. Cuenta con un botón <b>[+]</b> para emitir un nuevo pago y enlaces para reimprimir boletas."),
        ("7. Horas Extra Aprobadas", "Suma de horas extra que ya fueron autorizadas con el PIN 2322. Muestra aviso de advertencia si se rebasa el límite de 9h semanales."),
        ("8. H. Extra por Aprobar", "Horas pendientes de autorización. Si hay horas pendientes, se muestra un botón ámbar interactivo para saltar de inmediato a evaluarlas."),
        ("9. Horas Debidas (Bolsa)", "Déficit total acumulado por salidas anticipadas antes de las 8 horas. Muestra el badge <b>Bolsa</b> indicando el saldo neto a reponer."),
        ("10. Vacaciones Restantes", "Saldo neto disponible de días de vacaciones a la fecha. Al hacer clic en el botón se abre el desglose legal auditado completo."),
    ]
    col_table_data = []
    for c_title, c_desc in col_details:
        col_table_data.append([
            Paragraph(f"<b>{c_title}</b>", body_bold),
            Paragraph(c_desc, body_style)
        ])
    col_tbl = Table(col_table_data, colWidths=[140, 364])
    col_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,-1), COLOR_BG_ALT),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(col_tbl)
    story.append(Spacer(1, 8))

    story.append(Paragraph("5.4 Exportación a Excel Oficial con Fórmulas e INSS", h2_style))
    story.append(Paragraph(
        "Al presionar el botón <b>[Descargar Excel]</b>, el sistema genera de forma instantánea una hoja de cálculo profesional conteniendo:<br/>"
        "• Salario base ordinario desglosado por colaborador.<br/>"
        "• Monto bruto por horas extra autorizadas con recargo del 100%.<br/>"
        "• Monto de feriados y vacaciones pagadas.<br/>"
        "• Deducción del INSS Laboral (7.0%) y aporte del INSS Patronal (21.5% o 22.5%).<br/>"
        "• Monto neto a pagar listo para emitir cheques o transferencias de nómina.",
        body_style
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 6: VACACIONES, PERMISOS Y FERIADOS LEGALES
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 6: VACACIONES, PERMISOS Y FERIADOS LEGALES", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "El Bodegón Pass cuenta con un motor legal especializado que calcula y audita el cumplimiento de las normas del "
        "Código del Trabajo de Nicaragua (Ley N° 185).",
        body_style
    ))

    story.append(image_figure("vacaciones_modal.png", "Modal de Auditoría y Ajuste Legal de Vacaciones del Colaborador", height=2.2*inch))
    story.append(Spacer(1, 6))

    story.append(Paragraph("6.1 La Regla Legal de Acumulación de Vacaciones", h2_style))
    story.append(Paragraph(
        "De conformidad con el Artículo 76 del Código del Trabajo:<br/>"
        "• Todo trabajador tiene derecho a <b>15 días continuos de descanso remunerado por cada 6 meses continuos de trabajo</b>.<br/>"
        "• Esto equivale matemáticamente a <b>2.5 días acumulados por cada mes calendario laborado</b> (ó 0.0822 días por día calendario).<br/>"
        "El sistema toma la <code>fecha_ingreso</code> registrada en el expediente de cada trabajador y calcula en tiempo real los días ganados.",
        body_style
    ))

    story.append(Paragraph("6.2 Auditoría y Ajuste de Saldo de Vacaciones", h2_style))
    story.append(Paragraph(
        "Al presionar el botón de saldo en la columna 'Vacaciones Restantes', se abre el modal que presenta 5 casillas oficiales:<br/>"
        "1. <b>Días Ganados Históricos:</b> Días acumulados por antigüedad desde su ingreso.<br/>"
        "2. <b>Días Tomados en Descanso:</b> Días de vacaciones disfrutados físicamente.<br/>"
        "3. <b>Días Pagados en Dinero:</b> Días que han sido liquidados económicamente mediante recibo.<br/>"
        "4. <b>Ajuste Manual Auditado:</b> Permite al Administrador registrar un ajuste positivo o negativo con motivo obligatorio.<br/>"
        "5. <b>Saldo Disponible:</b> El resultado neto final disponible para goce o pago.",
        body_style
    ))

    story.append(Paragraph("6.3 Pago de Vacaciones en Dinero Paso a Paso", h2_style))
    story.append(Paragraph("<b>Paso 1:</b> En el Cuadro de Nómina, localice al empleado y pulse el botón <b>[ + ]</b> en la columna 'Vacaciones Pagadas'.", step_style))
    story.append(Paragraph("<b>Paso 2:</b> El sistema mostrará el saldo disponible actual y el salario diario ordinario.", step_style))
    story.append(Paragraph("<b>Paso 3:</b> Ingrese los días a pagar (ejemplo: 2.0 días). El sistema calculará el importe total en C$.", step_style))
    story.append(Paragraph("<b>Paso 4:</b> Pulse <b>[Emitir Pago de Vacaciones]</b>. Se generará de inmediato el recibo oficial con número correlativo (ej. <code>REC-VAC-2026-0012</code>) y se descontarán los 2 días del saldo del empleado.", step_style))

    story.append(Paragraph("6.4 Tratamiento de Feriados Oficiales Trabajados", h2_style))
    story.append(Paragraph(
        "El sistema contiene el catálogo de los feriados estipulados en el Art. 66 del Código del Trabajo.<br/>"
        "Cuando un empleado labora en feriado, el Kiosco lo registra automáticamente: se abona su pago ordinario del día y "
        "<b>se le acreditan 2 días adicionales a su saldo de vacaciones</b> como compensación legal.",
        body_style
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 7: GESTIÓN DE EMPLEADOS, ROSTROS Y CARNETS
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 7: GESTIÓN DE COLABORADORES Y CARNETS QR", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("7.1 Alta de Nuevos Colaboradores (`/admin/empleados`)", h2_style))
    story.append(Paragraph(
        "Cada vez que ingresa un nuevo miembro al equipo de cocina, salón, barra u operaciones, el Administrador debe crear su expediente:",
        body_style
    ))
    story.append(Paragraph("1. Ingresar a <code>/admin/empleados</code> y pulsar <b>[ + Nuevo Empleado ]</b>.", step_style))
    story.append(Paragraph("2. Llenar los datos básicos: Nombres, Apellidos, Cédula de Identidad y Teléfono.", step_style))
    story.append(Paragraph("3. Asignar el <b>Cargo Oficial</b> (ej. Cocinero, Mesero, Bartender, Limpieza, Cajero).", step_style))
    story.append(Paragraph("4. Seleccionar el <b>Área Operativa</b> correspondiente (Cocina, Salón, Caja/Barra, Operaciones o Gerencia).", step_style))
    story.append(Paragraph("5. Configurar el <b>Salario Base</b> (por hora o mensual) y la <b>Fecha de Ingreso</b> (clave para el cálculo de vacaciones).", step_style))
    story.append(Paragraph("6. Asignar un <b>PIN Personal de 4 Dígitos</b> (ej. 1425) para que el trabajador pueda marcar si falla la cámara.", step_style))

    story.append(Paragraph("7.2 Enrolamiento Facial Biométrico Paso a Paso", h2_style))
    story.append(Paragraph(
        "Para que el Kiosco reconozca el rostro del nuevo empleado de forma inmediata:<br/>"
        "1. En la lista de empleados, ubicar la fila del nuevo colaborador y pulsar el botón <b>[ Capturar Rostro ]</b>.<br/>"
        "2. Se abrirá la cámara en vivo. Solicite al empleado colocarse frente al lente, retirar gorras o lentes oscuros y mirar al centro.<br/>"
        "3. El modelo de Inteligencia Artificial detectará los 68 puntos biométricos del rostro.<br/>"
        "4. Presione <b>[ Guardar Rostro ]</b>. El sistema extraerá y guardará el vector biométrico encriptado en la base de datos.",
        body_style
    ))

    story.append(Paragraph("7.3 Generación e Impresión de Carnets con QR (`/admin/empleados/imprimir`)", h2_style))
    story.append(Paragraph(
        "Para formalizar la imagen corporativa y brindar credenciales a los empleados:<br/>"
        "1. Navegar a <code>/admin/empleados/imprimir</code>.<br/>"
        "2. El sistema genera una planilla lista para imprimir con el diseño oficial de carnet gafete de El Bodegón.<br/>"
        "3. Cada carnet incluye: Fotografía del colaborador, Logotipo, Cargo, Cédula y un <b>Código QR de Identificación Rápida</b>.<br/>"
        "4. Presionar <b>[ Imprimir Carnets ]</b> en papel opalina o cartulina para plastificar.",
        body_style
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 8: POLÍTICAS DE BOLSA DE HORAS Y CONTROL GERENCIAL
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 8: POLÍTICAS DE BOLSA DE HORAS & CONTROL", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "La <b>Bolsa de Horas</b> (campo <code>horas_pendientes</code>) es el mecanismo de control que sustituye a los antiguos "
        "descuentos ciegos. Es la herramienta mediante la cual gerencia administra las salidas anticipadas con justicia y transparencia.",
        body_style
    ))

    story.append(Paragraph("8.1 ¿Por qué se Eliminaron los Recortes Automáticos?", h2_style))
    story.append(Paragraph(
        "Anteriormente, si un colaborador tenía 2 horas extra pendientes por aprobar y un día salía 1 hora antes de su horario, "
        "el software recortaba automáticamente su solicitud de horas extra. Esto provocaba que el colaborador y el administrador no supieran "
        "dónde habían quedado esas horas y generaba desconfianza contable.<br/>"
        "<b>Bajo el nuevo esquema:</b> Las horas extra solicitadas <b>nunca se tocan automáticamente</b>. El déficit de salida anticipada "
        "se registra por separado en la Bolsa de Horas para que el Jefe decida qué hacer con él.",
        body_style
    ))

    story.append(Paragraph("8.2 Los 3 Protocolos de Resolución para el Administrador y el Jefe", h2_style))
    story.append(Paragraph(
        "Cuando un colaborador acumula horas debidas en su Bolsa de Horas, la administración puede optar por una de estas tres vías:",
        body_style
    ))
    story.append(Paragraph("<b>VÍA 1: Exonerar / Justificar la Salida:</b> Si la salida anticipada obedeció a una emergencia médica justificada con constancia del MINSA/INSS, o a un cierre anticipado ordenado por la administración por falta de fluido eléctrico o lluvia torrencial, el Administrador abre el ajuste y exonera el déficit registrando la justificación por escrito.", bullet_style))
    story.append(Paragraph("<b>VÍA 2: Cargar a Deuda para Reposición Futura:</b> El déficit se mantiene en la Bolsa de Horas. El Administrador programa al trabajador para cubrir un turno especial o ingresar 1 hora antes en un fin de semana concurrido, amortizando su saldo pendiente.", bullet_style))
    story.append(Paragraph("<b>VÍA 3: Cruzar con Horas Extra Aprobadas:</b> Si el colaborador tiene horas extra aprobadas en nómina, el Administrador y el Jefe pueden acordar cruzar las horas debidas contra sus horas extra en el momento de liquidar la quincena, registrándolo en la boleta de compensación oficial.", bullet_style))

    story.append(box_alert(
        "<b>Transparencia Total:</b> Ningún déficit debe ser eliminado sin dejar constancia en el campo de comentarios de la bitácora. "
        "Esto evita malos entendidos entre el Administrador y el Propietario en la rendición de cuentas.",
        "POLÍTICA ADMINISTRATIVA",
        "danger"
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 9: BODEGÓN CONTROL (COMPRAS Y GASTOS)
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 9: BODEGÓN CONTROL (COMPRAS Y GASTOS)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "El módulo <b>Bodegón Control</b> (accesible mediante el botón superior en <code>/control</code> y <code>/admin/compras</code>) "
        "permite registrar el flujo operativo de compras diarias e insumos del restaurante.",
        body_style
    ))

    story.append(Paragraph("9.1 Registro Diario de Compras de Insumos", h2_style))
    story.append(Paragraph(
        "El Administrador de turno debe asentar cada compra realizada para cocina, barra o salón:<br/>"
        "1. Ingresar a <code>/admin/compras</code> y pulsar <b>[ Registrar Compra ]</b>.<br/>"
        "2. Indicar el Proveedor, número de Factura o Recibo y Categoría (Carnes, Licores, Abarrotes, Verduras, Desechables).<br/>"
        "3. Especificar el método de pago utilizado (Efectivo de Caja Chica, Transferencia Bancaria o Tarjeta).<br/>"
        "4. Adjuntar fotografía de la factura física desde la cámara del teléfono o tablet.",
        body_style
    ))

    story.append(Paragraph("9.2 Cierre de Turno y Cuadre de Gastos", h2_style))
    story.append(Paragraph(
        "Al finalizar el día, el Administrador genera el resumen de compras diarias para entregarlo junto con el corte de caja al Jefe. "
        "El sistema genera el balance consolidado impidiendo salidas de dinero no soportadas.",
        body_style
    ))

    story.append(Spacer(1, 15))

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 10: SEGURIDAD, RESPALDOS Y MANTENIMIENTO
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 10: SEGURIDAD, RESPALDOS Y MANTENIMIENTO", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("10.1 Descarga Quincenal del Respaldo de Base de Datos", h2_style))
    story.append(Paragraph(
        "Toda la información histórica de empleados, marcajes, fotografías y horas extra está resguardada en una base de datos PostgreSQL. "
        "No obstante, ante contingencias en servidores o caídas de red, <b>el Jefe debe descargar un respaldo quincenal</b>:<br/>"
        "1. En el encabezado superior de <code>/admin</code>, hacer clic en el botón <b>[ 💾 Respaldo BD ]</b>.<br/>"
        "2. El sistema empaquetará todas las tablas en un archivo JSON encriptado con marca de fecha (ej. <code>backup_bodegon_2026_09_26.json</code>).<br/>"
        "3. Guardar este archivo en un disco duro externo o en una cuenta segura de Google Drive.",
        body_style
    ))

    story.append(Paragraph("10.2 Depuración Semestral de Fotografías de Auditoría", h2_style))
    story.append(Paragraph(
        "Dado que el Kiosco captura una fotografía por cada marcaje, con el transcurso de los meses el almacenamiento del servidor "
        "acumula miles de imágenes. Cada 6 meses, el sistema mostrará una alerta de mantenimiento en la campanita:<br/>"
        "• Al presionar <b>[ 🧹 Ejecutar Depuración Semestral ]</b>, el software elimina de forma segura las imágenes fotográficas "
        "de más de 6 meses de antigüedad, <b>pero conserva al 100% todos los registros numéricos, horas y nóminas</b>, liberando gigabytes de memoria sin perder información legal.",
        body_style
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 11: GUÍA DE RESOLUCIÓN DE INCIDENCIAS (TROUBLESHOOTING)
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 11: RESOLUCIÓN DE INCIDENCIAS (FAQ)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Esta tabla contiene las soluciones directas a los 10 problemas operativos más comunes:",
        body_style
    ))

    faq_data = [
        [Paragraph("Problema o Síntoma", table_th_style), Paragraph("Causa Probable", table_th_style), Paragraph("Solución Paso a Paso", table_th_style)],
        [
            Paragraph("El Kiosco dice 'Rostro no reconocido'", table_td_style),
            Paragraph("Mala iluminación, lentes oscuros o rostro cambiado.", table_td_style),
            Paragraph("1. Marcar usando el botón <b>[Ingresar con PIN]</b>.<br/>2. En <code>/admin/empleados</code>, volver a capturar su rostro con buena luz.", table_td_style)
        ],
        [
            Paragraph("No se generó hora extra tras salir 20 minutos tarde", table_td_style),
            Paragraph("Regla de umbral mínimo de 30 minutos.", table_td_style),
            Paragraph("No es un error: las horas extra solo se computan a partir de 30 minutos (0.5 hrs). Tiempos menores se descartan.", table_td_style)
        ],
        [
            Paragraph("La pantalla del PIN se queda pegada o con lag", table_td_style),
            Paragraph("Caché sobrecargada en el navegador de la PC.", table_td_style),
            Paragraph("Presionar <b>Ctrl + F5</b> para recargar. El nuevo modal PIN 2322 opera en 0 ms sin sobrecarga.", table_td_style)
        ],
        [
            Paragraph("Un colaborador tiene horas en 'Bolsa de Horas'", table_td_style),
            Paragraph("Marcó salida antes de cumplir 8.0 horas.", table_td_style),
            Paragraph("Verificar en bitácora a qué hora salió. Decidir si se exonera con justificante médico o se programa para reponer.", table_td_style)
        ],
        [
            Paragraph("Un marcaje quedó abierto sin salida de noche", table_td_style),
            Paragraph("El empleado olvidó marcar salida al irse.", table_td_style),
            Paragraph("Hacer clic en la campana de alertas y presionar el botón <b>[ 🌙 Cerrar 11:00 PM ]</b>.", table_td_style)
        ],
        [
            Paragraph("El Kiosco muestra pantalla negra en la cámara", table_td_style),
            Paragraph("Permiso de cámara bloqueado o cable suelto.", table_td_style),
            Paragraph("En la barra de direcciones del navegador, pulsar el candado y asegurarse de que el permiso de <b>Cámara</b> esté en 'Permitir'.", table_td_style)
        ],
        [
            Paragraph("Se aprobó una hora extra por error", table_td_style),
            Paragraph("Fallo humano en la digitación.", table_td_style),
            Paragraph("En <code>/admin/nomina</code> pestaña Horas Extra -> 'Por Pagar', ubicar el registro y presionar <b>[Modificar]</b> o <b>[Anular]</b>.", table_td_style)
        ],
        [
            Paragraph("No coinciden las vacaciones de un empleado antiguo", table_td_style),
            Paragraph("Fecha de ingreso mal configurada en su perfil.", table_td_style),
            Paragraph("Ir a <code>/admin/empleados</code>, corregir la <b>Fecha de Ingreso</b> al día real de contratación y presionar Guardar.", table_td_style)
        ],
        [
            Paragraph("El Excel quincenal no descarga", table_td_style),
            Paragraph("Bloqueador de ventanas emergentes activo.", table_td_style),
            Paragraph("Permitir descargas automáticas en la configuración del navegador Chrome o Edge.", table_td_style)
        ],
    ]
    faq_tbl = Table(faq_data, colWidths=[120, 110, 274])
    faq_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, COLOR_BG_ALT]),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    story.append(faq_tbl)

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 12: CHECKLIST DE RESPONSABILIDADES
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 12: CHECKLIST DE RESPONSABILIDADES", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("12.1 Rutina Diaria del Administrador de Turno", h2_style))
    adm_checklist = [
        "<b>Al Iniciar Turno (Mañana o Tarde):</b><br/>"
        "[ ] Limpiar el lente de la cámara de la tablet del Kiosco con paño de microfibra.<br/>"
        "[ ] Verificar que el Kiosco esté conectado a la red WiFi y a la toma de corriente.<br/>"
        "[ ] Abrir <code>/control</code> y constatar que los empleados programados hayan marcado Entrada.",
        "<b>A Mediodía / Durante el Servicio:</b><br/>"
        "[ ] Monitorear que los colaboradores marquen [Inicio Comida] y [Fin Comida] al tomar su tiempo legal de almuerzo.<br/>"
        "[ ] Revisar la campanita de notificaciones ante cualquier tardanza.",
        "<b>Al Finalizar Turno Nocturno (Cierre):</b><br/>"
        "[ ] Verificar que todo el personal que se retira haya pulsado [SALIDA] en el Kiosco.<br/>"
        "[ ] Si algún colaborador olvidó marcar, utilizar el botón <b>[Cerrar 11:00 PM]</b> en la campanita de alertas.<br/>"
        "[ ] Dejar la tablet del Kiosco cargando para el turno siguiente.",
    ]
    for chk in adm_checklist:
        story.append(Paragraph(chk, body_style))
        story.append(Spacer(1, 4))

    story.append(Paragraph("12.2 Rutina Semanal y Quincenal del Jefe / Gerente General", h2_style))
    boss_checklist = [
        "<b>Revisión Semanal (Lunes por la mañana):</b><br/>"
        "[ ] Ingresar a <code>/admin/nomina</code> -> Horas Extra -> 'Solicitudes Pendientes'.<br/>"
        "[ ] Previsualizar el detalle de horas acumuladas de la semana anterior.<br/>"
        "[ ] Autorizar o rechazar solicitudes con el PIN Maestro <b>2322</b>.<br/>"
        "[ ] Verificar que ningún colaborador sobrepase las 9 horas semanales (Art. 58 Código del Trabajo).",
        "<b>Cierre de Quincena (Días 15 y último de mes):</b><br/>"
        "[ ] Seleccionar '1ra Quincena' o '2da Quincena' en el Cuadro de Nómina.<br/>"
        "[ ] Auditar que las 10 columnas sumen de forma coherente.<br/>"
        "[ ] En la pestaña Horas Extra -> 'Por Pagar', liquidar los saldos y generar recibos.<br/>"
        "[ ] Si se acordó pago de vacaciones en dinero, emitir el recibo con el botón [+].<br/>"
        "[ ] Pulsar <b>[Descargar Planilla Quincenal]</b> en Excel para proceder al pago bancario.<br/>"
        "[ ] Pulsar <b>[ 💾 Respaldo BD ]</b> para guardar la copia de seguridad quincenal de la base de datos.",
    ]
    for chk in boss_checklist:
        story.append(Paragraph(chk, body_style))
        story.append(Spacer(1, 4))

    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=4, spaceAfter=8))
    story.append(Paragraph(
        "<b>RESTAURANTE & BAR EL BODEGÓN</b><br/>"
        "Sistema El Bodegón Pass v2.0 • Desarrollado para la Excelencia Operativa y el Cumplimiento Laboral.<br/>"
        "<i>Cualquier modificación o actualización al presente manual debe ser aprobada por la Gerencia General.</i>",
        ParagraphStyle('EndFooter', parent=body_style, alignment=1, fontSize=8, textColor=COLOR_MUTED)
    ))

    # Construir documento final con NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"[OK] Manual exhaustivo generado exitosamente en: {output_path}")

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, '../../'))

    public_target = os.path.join(project_root, 'frontend/public/manual_el_bodegon_pass.pdf')
    root_target = os.path.join(project_root, 'Manual_de_Usuario_El_Bodegon_Pass.pdf')

    build_pdf_manual(public_target)
    build_pdf_manual(root_target)
