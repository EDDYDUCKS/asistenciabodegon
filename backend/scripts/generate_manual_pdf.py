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
        self.drawRightString(letter[0] - 54, letter[1] - 34, "GUÍA PRÁCTICA PARA ADMINISTRADOR Y JEFE")

        self.setStrokeColor(COLOR_BORDER)
        self.setLineWidth(0.75)
        self.line(54, letter[1] - 40, letter[0] - 54, letter[1] - 40)

        # Pie de página (Footer)
        self.line(54, 45, letter[0] - 54, 45)
        self.setFont("Helvetica", 7.5)
        self.setFillColor(COLOR_MUTED)
        self.drawString(54, 32, "Restaurante & Bar El Bodegón  •  Control de Asistencia, Nómina y Horas Extra")
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
        fontSize=13.5,
        leading=17,
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
        leading=13.5,
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
        leading=11,
        textColor=COLOR_TEXT,
    )

    story = []

    # Rutas
    base_dir = os.path.dirname(os.path.abspath(__file__))
    public_dir = os.path.join(base_dir, '../../frontend/public')
    logo_path = os.path.join(public_dir, 'logo-emblem.png')

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

    def ui_mockup_box(title, rows, footer_note=None):
        """Genera un componente visual vectorial que representa una pantalla o menú del sistema."""
        tbl_data = []
        tbl_data.append([Paragraph(f"<b>🖥️ {title.upper()}</b>", ParagraphStyle('MockT', parent=callout_text, fontName='Helvetica-Bold', textColor=colors.white, fontSize=8.5))])
        for r in rows:
            tbl_data.append([Paragraph(r, callout_text)])
        if footer_note:
            tbl_data.append([Paragraph(f"<i>📌 {footer_note}</i>", ParagraphStyle('MockF', parent=callout_text, fontName='Helvetica-Oblique', textColor=COLOR_MUTED, fontSize=7.5))])
        
        t = Table(tbl_data, colWidths=[504])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY_DARK),
            ('BACKGROUND', (0,1), (-1,-1), COLOR_BG_ALT),
            ('BOX', (0,0), (-1,-1), 1, COLOR_PRIMARY),
            ('INNERGRID', (0,1), (-1,-1), 0.5, COLOR_BORDER),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('LEFTPADDING', (0,0), (-1,-1), 8),
            ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ]))
        return t

    # ═════════════════════════════════════════════════════════════════════════
    # 1. PORTADA EJECUTIVA
    # ═════════════════════════════════════════════════════════════════════════
    banner_data = [
        [Paragraph("<font size=9 color='#d1fae5'><b>MANUAL COMPLETO DE USUARIO Y OPERACIONES</b></font>", cover_sub_style)],
        [Paragraph("EL BODEGÓN PASS", cover_title_style)],
        [Paragraph("Guía Práctica Paso a Paso para el Administrador de Turno y el Jefe", ParagraphStyle('CSub2', parent=cover_sub_style, fontName='Helvetica-Bold', fontSize=13, textColor=colors.HexColor('#fde047')))],
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
        [Paragraph("<b>¿Para quién es este manual?</b>", body_bold), Paragraph("Para el Administrador de Turno, Supervisores, Cajeros, Gerencia General y Propietario.", body_style)],
        [Paragraph("<b>Propósito:</b>", body_bold), Paragraph("Explicar en lenguaje 100% sencillo y sin tecnicismos cómo manejar el Kiosco de la entrada, cómo revisar la asistencia del día, cómo autorizar horas extra con el PIN 2322, cómo pagar vacaciones y cómo sacar la nómina quincenal.", body_style)],
        [Paragraph("<b>Enfoque:</b>", body_bold), Paragraph("Instrucciones paso a paso (1, 2, 3) a prueba de errores, diseñadas para que cualquier persona sin conocimientos de computación pueda dominar el sistema en pocos minutos.", body_style)],
        [Paragraph("<b>Claves Secretas:</b>", body_bold), Paragraph("Contiene los códigos PIN de seguridad (PIN de entrada <b>4512</b> y PIN maestro de horas extra <b>2322</b>).", body_style)],
    ]
    meta_tbl = Table(meta_rows, colWidths=[130, 374])
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
        "<i>«Este manual está escrito para que el personal del restaurante sepa exactamente qué botón tocar, qué significa cada color y cómo resolver cualquier situación en su turno sin enredos.»</i>",
        ParagraphStyle('Quotes', parent=body_style, fontName='Helvetica-Oblique', alignment=1, textColor=COLOR_MUTED)
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # 2. ÍNDICE GENERAL DETALLADO
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("ÍNDICE GENERAL DEL MANUAL", h1_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    toc_items = [
        ("Capítulo 1", "¿Cómo funciona El Bodegón Pass y quién hace cada tarea?", "Pág. 3"),
        ("Capítulo 2", "La Tablet de la Entrada (El Kiosco donde marcan los muchachos)", "Pág. 4"),
        ("Capítulo 3", "El Panel de Control en Vivo (Supervisión del restaurante)", "Pág. 6"),
        ("Capítulo 4", "Módulo de Horas Extra (Aprobar con PIN 2322 y sacar Boletas)", "Pág. 7"),
        ("Capítulo 5", "El Cuadro de Nómina (Reporte de Horas, Filtros y Planilla Excel)", "Pág. 9"),
        ("Capítulo 6", "Vacaciones, Permisos y Feriados (Cálculo según la ley de Nicaragua)", "Pág. 10"),
        ("Capítulo 7", "Meter Empleados Nuevos, Tomarles la Foto y Sacar sus Carnets", "Pág. 11"),
        ("Capítulo 8", "La Bolsa de Horas (Qué hacer cuando alguien sale temprano)", "Pág. 12"),
        ("Capítulo 9", "Control de Compras y Gastos Diarios (Bodegón Control)", "Pág. 13"),
        ("Capítulo 10", "Seguridad del Sistema, Guardar Copias de Respaldo y Limpieza", "Pág. 13"),
        ("Capítulo 11", "¿Qué hago si...? (Guía rápida para resolver los 10 problemas típicos)", "Pág. 14"),
        ("Capítulo 12", "Lista de Tareas Diarias y Quincenales del Administrador y del Jefe", "Pág. 15"),
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
        "<b>Cómo leer este manual:</b> Cada vez que veas un texto en negrita entre corchetes como <b>[ Entrada ]</b> o <b>[ Evaluar ]</b>, "
        "significa que es un botón de la pantalla que debes tocar con el dedo o hacer clic con el ratón.",
        "CONSEJO DE LECTURA",
        "info"
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 1: INTRODUCCIÓN GENERAL Y ARQUITECTURA
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 1: CÓMO FUNCIONA EL BODEGÓN PASS", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("1.1 ¿Qué es el sistema y para qué sirve en el restaurante?", h2_style))
    story.append(Paragraph(
        "<b>El Bodegón Pass</b> es el sistema digital que controla la asistencia, los horarios y los pagos de los colaboradores "
        "de <b>Restaurante & Bar El Bodegón</b>. Su objetivo es que la administración y el jefe tengan el control exacto de quién vino a trabajar, "
        "a qué hora llegó, a qué hora comió, a qué hora se fue y cuántas horas extra se le deben pagar de forma justa y legal.",
        body_style
    ))
    story.append(Paragraph(
        "El sistema tiene dos partes principales que debes distinguir claramente:",
        body_style
    ))
    story.append(Paragraph("• <b>La Tablet de la Entrada (El Kiosco):</b> Es la pantalla táctil montada en la pared por donde entran los colaboradores. Solo sirve para que los cocineros, meseros, bartenders y personal de limpieza marquen su asistencia mirándose a la cámara o poniendo su PIN.", bullet_style))
    story.append(Paragraph("• <b>El Panel de Administración (En la Computadora o Celular):</b> Es la pantalla que usan el Administrador y el Jefe para revisar quién está trabajando, autorizar horas extra, emitir boletas de pago, ver vacaciones y descargar la planilla de pago en Excel.", bullet_style))

    story.append(Paragraph("1.2 Las Claves de Seguridad que debes Memorizar", h2_style))
    story.append(Paragraph(
        "Para que nadie ajeno mueva la información de la empresa, el sistema está protegido con claves numéricas muy sencillas:",
        body_style
    ))

    story.append(ui_mockup_box(
        "LAS 3 CLAVES SECRETAS DE EL BODEGÓN",
        [
            "🔑 <b>PIN 4512 (Para entrar al Panel de Administración):</b> Lo pone el Administrador o el Jefe en la computadora de caja o en su celular para abrir el sistema. Abre el menú de empleados, asistencia y nómina.",
            "⭐ <b>PIN 2322 (PIN Maestro de Horas Extra):</b> Es la clave de máxima autoridad que solo el Jefe o la Gerencia General conocen. Se escribe cada vez que se va a autorizar o rechazar una hora extra para generar la boleta oficial.",
            "👤 <b>PIN Personal del Colaborador (4 dígitos):</b> Cada mesero o cocinero tiene su propio número (por ejemplo 1234) para poder marcar en la tablet si la cámara no le reconoce la cara por poca luz o por andar lentes."
        ],
        "Nunca anotes estas claves a la vista del público ni las compartas con el personal operativo."
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("1.3 ¿Qué le toca hacer al Administrador y qué le toca hacer al Jefe?", h2_style))
    roles_matrix = [
        [Paragraph("Tarea Operativa", table_th_style), Paragraph("¿Le toca al Administrador de Turno?", table_th_style), Paragraph("¿Le toca al Jefe / Propietario?", table_th_style)],
        [Paragraph("Revisar que la Tablet esté encendida y limpia", table_td_style), Paragraph("<b>SÍ</b> (Al abrir el restaurante en su turno)", table_td_style), Paragraph("Supervisa aleatoriamente", table_td_style)],
        [Paragraph("Monitorear quién vino y quién falta", table_td_style), Paragraph("<b>SÍ</b> (En la pantalla de Asistencia de Hoy)", table_td_style), Paragraph("Revisa el resumen general", table_td_style)],
        [Paragraph("Cerrar turnos a quienes olvidaron marcar salida", table_td_style), Paragraph("<b>SÍ</b> (Tocando 'Cerrar 11:00 PM' en la campanita)", table_td_style), Paragraph("Revisa justificaciones", table_td_style)],
        [Paragraph("Aprobar Horas Extra con el PIN 2322", table_td_style), Paragraph("Prepara y revisa la lista de horas", table_td_style), Paragraph("<b>SÍ</b> (Es quien pone el PIN 2322 y autoriza)", table_td_style)],
        [Paragraph("Emitir Boletas de Vacaciones en dinero", table_td_style), Paragraph("Llena los días que pide el muchacho", table_td_style), Paragraph("<b>SÍ</b> (Firma y autoriza la entrega del dinero)", table_td_style)],
        [Paragraph("Descargar el Excel para pagar la quincena", table_td_style), Paragraph("Revisa que los días trabajados estén bien", table_td_style), Paragraph("<b>SÍ</b> (Descarga el archivo y realiza los pagos)", table_td_style)],
    ]
    roles_tbl = Table(roles_matrix, colWidths=[160, 170, 174])
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
    story.append(Paragraph("CAPÍTULO 2: LA TABLET DE LA ENTRADA (EL KIOSCO)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "En la entrada del restaurante, en la pared, está instalada la Tablet del Kiosco. "
        "Esta pantalla está encendida todo el día con la cámara activa. Los muchachos no deben tardar más de 3 segundos en marcar.",
        body_style
    ))

    # Mockup visual de la Tablet
    story.append(ui_mockup_box(
        "ASÍ SE VE LA PANTALLA DE LA TABLET DE ENTRADA",
        [
            "📷 <b>ÁREA DE CÁMARA (Al centro):</b> Muestra la imagen en vivo. Al colocarse frente a ella, dibuja un recuadro verde y dice: <i>'¡Hola, Carlos Eduardo!'</i>",
            "🟢 <b>BOTÓN VERDE [ ENTRADA ]:</b> Se presiona únicamente al llegar al restaurante a iniciar el turno.",
            "🟠 <b>BOTÓN ÁMBAR [ INICIO COMIDA ]:</b> Se presiona cuando el muchacho se sienta a comer su almuerzo o cena.",
            "🔵 <b>BOTÓN AZUL [ FIN COMIDA ]:</b> Se presiona en cuanto termina de comer para volver a sus labores de inmediato.",
            "🔴 <b>BOTÓN ROJO [ SALIDA ]:</b> Se presiona al quitarse el uniforme e irse definitivamente para la casa.",
            "⌨️ <b>BOTÓN INFERIOR [ Ingresar con PIN ]:</b> Se toca si la cámara no reconoce la cara del trabajador."
        ],
        "La Tablet toma una fotografía instantánea en secreto cada vez que se pulsa un botón para comprobar que nadie marque por otro."
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("2.1 Cómo Marcar Asistencia Paso a Paso (Para los Muchachos)", h2_style))
    story.append(Paragraph("<b>Paso 1: Pararse frente a la pantalla:</b> El colaborador se para a unos 50 centímetros de la tablet mirando a la cámara.", step_style))
    story.append(Paragraph("<b>Paso 2: Esperar el saludo:</b> En 1 segundo la tablet detectará su rostro y pondrá su nombre arriba en letras grandes.", step_style))
    story.append(Paragraph("<b>Paso 3: Tocar el botón que corresponda:</b>", step_style))
    story.append(Paragraph("   • Si va entrando: Toca el botón verde <b>[ ENTRADA ]</b>.", bullet_style))
    story.append(Paragraph("   • Si va a almorzar: Toca el botón naranja <b>[ INICIO COMIDA ]</b>.", bullet_style))
    story.append(Paragraph("   • Si terminó de almorzar: Toca el botón azul <b>[ FIN COMIDA ]</b>.", bullet_style))
    story.append(Paragraph("   • Si ya terminó su día de trabajo: Toca el botón rojo <b>[ SALIDA ]</b>.", bullet_style))
    story.append(Paragraph("<b>Paso 4: Pantalla verde de confirmación:</b> La pantalla sonará con una campanita alegre y se pondrá verde diciendo: <i>'¡Marcaje Registrado con Éxito!'</i>. Listo, el trabajador ya puede pasar a su área.", step_style))

    story.append(Paragraph("2.2 ¿Qué hacer si la cámara no reconoce la cara del muchacho?", h2_style))
    story.append(Paragraph(
        "Si la cámara no lo reconoce (por ejemplo, porque el salón está oscuro, porque trae gorra, mascarilla o vendas):",
        body_style
    ))
    story.append(Paragraph("1. Tocar el botón gris abajo que dice <b>[ Ingresar con PIN ]</b>.", step_style))
    story.append(Paragraph("2. Saldrá un teclado numérico grande en la pantalla. El muchacho escribe sus <b>4 dígitos personales</b>.", step_style))
    story.append(Paragraph("3. La tablet cargará su nombre de inmediato y le permitirá tocar [Entrada], [Comida] o [Salida] normalmente.", step_style))

    story.append(PageBreak())

    story.append(Paragraph("2.3 Las Dos Reglas de Oro que el Kiosco Calcula Solo", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Tanto el Administrador como el Jefe deben tener clarísimas estas dos reglas para saber cómo calcula el sistema las horas de la gente:",
        body_style
    ))

    story.append(ui_mockup_box(
        "REGLA 1: SI SALE TEMPRANO, CADA MINUTO QUE FALTE SE GUARDA EN SU BOLSA DE HORAS",
        [
            "• La jornada obligatoria de trabajo en El Bodegón es de <b>8 horas completas</b>.",
            "• Si un muchacho marca salida y solo trabajó <b>7 horas con 30 minutos</b> (le faltó media hora), el sistema no le borra nada a escondidas.",
            "• El sistema anota automáticamente: <b>Déficit: 0.5 horas (30 minutos debidos)</b>.",
            "• Ese tiempo que debe se suma a su cuenta personal de <b>Bolsa de Horas</b> y le avisa al Jefe con una alerta para que decida si lo perdona (por ejemplo si salió por cita médica) o si le pide reponerlo en otro turno."
        ],
        "Cero tolerancia: no hay minutos de gracia. Cualquier salida antes de las 8 horas exactas queda registrada."
    ))
    story.append(Spacer(1, 8))

    story.append(ui_mockup_box(
        "REGLA 2: LAS HORAS EXTRA SOLO EMPIEZAN A CONTAR A PARTIR DE 30 MINUTOS DESPUÉS DE SU HORA",
        [
            "• Para evitar que la gente cobre horas extra por quedarse 10 minutos platicando o cambiándose el mandil, las horas extra <b>solo se activan a partir de 30 minutos (0.5 hrs) laborados sobre las 8 horas normales</b>.",
            "• <b>Ejemplo A:</b> Si trabajó <b>8 horas y 15 minutos</b>: No hay horas extra. Su turno cierra en 8 horas normales completas.",
            "• <b>Ejemplo B:</b> Si trabajó <b>8 horas y 35 minutos</b>: Ya pasó la media hora. El sistema le genera automáticamente una solicitud de <b>0.5 horas extra (media hora)</b>.",
            "• <b>Ejemplo C:</b> Si trabajó <b>9 horas y 10 minutos</b>: Hizo una hora completa más. El sistema le genera una solicitud de <b>1.0 hora extra</b>.",
            "• Las horas extra siempre se cuentan en bloques limpios de media hora: 0.5h, 1.0h, 1.5h, 2.0h, etc."
        ],
        "Ninguna hora extra se paga sola. Todas van a la bandeja de pendientes para que el Jefe las revise y las autorice con su PIN 2322."
    ))

    story.append(Spacer(1, 10))
    story.append(box_alert(
        "<b>Consejo para el Administrador:</b> Al empezar tu turno por la mañana o por la tarde, pasa un paño suave por el lente de la cámara "
        "de la tablet. En los restaurantes el vapor y la grasa del ambiente empañan el lente y eso hace que la cámara tarde en enfocar las caras.",
        "MANTENIMIENTO DIARIO DEL KIOSCO",
        "warning"
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 3: PANEL DE MONITOREO EN TIEMPO REAL
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 3: EL PANEL DE CONTROL EN VIVO", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Desde la computadora de caja o desde tu teléfono celular puedes ver exactamente qué está pasando en el restaurante "
        "en cualquier segundo del día.",
        body_style
    ))

    story.append(Paragraph("3.1 Cómo Entrar al Sistema", h2_style))
    story.append(Paragraph("1. Abre el navegador de internet en la computadora o celular y abre El Bodegón Pass.", step_style))
    story.append(Paragraph("2. La pantalla te pedirá el PIN de acceso administrativo. Escribe <b>4512</b>.", step_style))
    story.append(Paragraph("3. ¡Listo! Ya estás adentro del panel general del restaurante.", step_style))

    story.append(Paragraph("3.2 La Pantalla de Asistencia de Hoy (El Semáforo del Personal)", h2_style))
    story.append(Paragraph(
        "En el menú de arriba, haz clic en <b>'Asistencia'</b>. Verás la lista de todo el personal dividida en 4 colores muy claros:",
        body_style
    ))

    story.append(ui_mockup_box(
        "LOS 4 COLORES DE LA ASISTENCIA DE HOY",
        [
            "🟢 <b>VERDE (Presentes en Turno):</b> Son los muchachos que ya marcaron Entrada y están en la cocina, salón o barra trabajando.",
            "🟠 <b>ÁMBAR (En Comida / Almuerzo):</b> Son los colaboradores que marcaron Inicio de Comida. La pantalla te muestra cuántos minutos llevan comiendo para que no se pasen de su tiempo.",
            "🔵 <b>AZUL / GRIS (Salida Registrada):</b> Son los trabajadores que ya terminaron su turno y marcaron su salida formal para irse a su casa.",
            "🔴 <b>ROJO (Ausentes / No han llegado):</b> Empleados que debían entrar a trabajar y no han puesto su Entrada. Te sirve para llamarlos de inmediato a ver qué pasó."
        ],
        "Al hacer clic sobre el nombre de cualquier persona, puedes ver la foto exacta que le tomó la tablet al momento de marcar."
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("3.3 La Campanita de Alertas (Esquina Superior Derecha)", h2_style))
    story.append(Paragraph(
        "Arriba a la derecha hay un ícono de campana con un circulito rojo. Si tiene un número, hazle clic para ver avisos urgentes:",
        body_style
    ))
    story.append(Paragraph("• <b>Aviso de Salida Temprano:</b> Te avisa si alguien marcó salida antes de tiempo y cuántas horas debe.", bullet_style))
    story.append(Paragraph("• <b>Aviso de Horas Extra:</b> Te avisa si alguien se quedó trabajando después de su hora.", bullet_style))
    story.append(Paragraph("• <b>Aviso de Turno Abierto:</b> Te avisa si alguien se fue a su casa y se le olvidó marcar salida.", bullet_style))

    story.append(Paragraph("3.4 ¿Qué hacer si alguien se fue a su casa sin marcar salida?", h2_style))
    story.append(Paragraph(
        "Pasa seguido: un mesero termina cansado a las 10:30 PM y se va directo a su casa sin tocar la tablet. "
        "A las 11:00 de la noche la campanita se pondrá roja diciendo: <i>'Registro Incompleto'</i>.<br/>"
        "<b>Para resolverlo en 2 segundos:</b><br/>"
        "1. Haz clic en la <b>campanita</b> arriba a la derecha.<br/>"
        "2. Verás la alerta con el nombre del muchacho.<br/>"
        "3. Pulsa el botón que dice <b>[ 🌙 Cerrar 11:00 PM ]</b>.<br/>"
        "4. El sistema le pondrá la hora de salida a las 11:00 PM de esa noche y el problema quedará resuelto, evitando que el reloj siga corriendo al día siguiente.",
        body_style
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 4: GESTIÓN DE HORAS EXTRA
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 4: CÓMO APROBAR HORAS EXTRA (PIN 2322)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Este capítulo es exclusivo para el <b>Jefe / Propietario</b> y para el <b>Administrador</b>. "
        "Aquí se autoriza o se rechaza el pago de cualquier hora extra trabajada en el restaurante.",
        body_style
    ))

    story.append(Paragraph("4.1 Dónde se Revisan las Horas Extra", h2_style))
    story.append(Paragraph("1. En la barra de arriba, haz clic en la pestaña <b>'Nómina'</b>.", step_style))
    story.append(Paragraph("2. En los botones de abajo, haz clic en la segunda pestaña que dice <b>'Horas Extra'</b>.", step_style))
    story.append(Paragraph("3. Entrarás a la lista de <b>'Solicitudes Pendientes'</b> con un numerito amarillo que indica cuántas solicitudes hay por revisar.", step_style))

    story.append(ui_mockup_box(
        "CÓMO SE VE LA LISTA DE HORAS EXTRA PENDIENTES",
        [
            "👤 <b>Colaborador:</b> Marlon Zenón • Cargo: Cocinero",
            "📅 <b>Fecha del Turno:</b> Domingo 13 de Septiembre • Entrada: 11:00 AM • Salida: 08:35 PM",
            "⏱️ <b>Tiempo Cumplido:</b> 8.0 horas normales • <b>Horas Extra Solicitadas: +1.0 hrs</b>",
            "🔘 <b>BOTÓN AMARILLO [ Evaluar ]:</b> Tócalo para abrir la ventana de decisión.",
            "⚠️ <b>ALERTA DE SEGURIDAD (Si aparece):</b> <code>⚠️ >9h sem (Art. 58)</code> significa que este trabajador ya lleva más de 9 horas extra esta semana y la ley de Nicaragua prohíbe pasar de ese límite."
        ],
        "Toda hora extra se muestra con su hora real de entrada y salida para que el Jefe verifique si es verdad que se quedó apoyando."
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("4.2 Paso a Paso para Aprobar o Rechazar", h2_style))
    story.append(Paragraph("<b>Paso 1: Tocar [ Evaluar ]:</b> En la fila del colaborador, pulsa el botón amarillo <b>[ Evaluar ]</b>.", step_style))
    story.append(Paragraph("<b>Paso 2: Revisar las Horas:</b> Verás cuántas horas solicita. Si solicita 1.0 hora pero tú como jefe consideras que solo debió quedarse media hora, puedes cambiar el número a <b>0.5</b>.", step_style))
    story.append(Paragraph("<b>Paso 3: Elegir Acción:</b>", step_style))
    story.append(Paragraph("   • Si las vas a autorizar: Pulsa el botón verde <b>[ Aprobar ]</b>.", bullet_style))
    story.append(Paragraph("   • Si no las autorizas (por ejemplo, porque se quedó esperando transporte y no trabajando): Pulsa el botón rojo <b>[ Rechazar ]</b> y escribe el motivo obligatorio.", bullet_style))
    story.append(Paragraph("<b>Paso 4: Poner el PIN Maestro 2322:</b> Se abrirá una ventana en el centro con 4 casillas. En tu teclado o en la pantalla escribe <b>2322</b>. Al poner el último 2, los cuatro puntos se pondrán verdes y la ventana se cerrará al instante sin trabarse.", step_style))
    story.append(Paragraph("<b>Paso 5: Apertura Automática de la Boleta Oficial:</b> Si aprobaste la solicitud, en ese mismo segundo se abrirá en tu pantalla la <b>Boleta Oficial de Horas Extra</b>.", step_style))

    story.append(PageBreak())

    story.append(Paragraph("4.3 La Boleta Oficial de Horas Extra (Para Imprimir y Firmar)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Al aprobar una hora extra, el sistema genera de forma automática una <b>Boleta Oficial</b> con su propio número de folio único "
        "(ejemplo: <code>BHE-2026-0042</code>).",
        body_style
    ))

    story.append(ui_mockup_box(
        "ASÍ ES LA BOLETA OFICIAL DE HORAS EXTRA (BHE)",
        [
            "🏢 <b>ENCABEZADO:</b> Logotipo de El Bodegón, fecha de emisión y Número de Folio único.",
            "👤 <b>DATOS:</b> Nombre del colaborador, cargo y salario base por hora.",
            "⏱️ <b>AUDITORÍA:</b> Horas exactas que marcó en el Kiosco (Entrada y Salida del día).",
            "💰 <b>CÁLCULO DEL DINERO:</b> Horas autorizadas calculadas con el <b>100% de recargo (tarifa doble obligatoria por ley)</b> y monto exacto en Córdobas (C$).",
            "✍️ <b>FIRMAS:</b> Espacio para que firme el Administrador/Jefe y espacio para que firme el Colaborador.",
            "🖨️ <b>BOTÓN AZUL [ Imprimir ]:</b> En la esquina superior derecha de la boleta hay un botón que la manda directo a la impresora."
        ],
        "Guarda las boletas firmadas en la carpeta de nómina para respaldo contable y laboral de la empresa."
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("4.4 El Apartado 'Por Pagar' y el Cierre de Quincena", h2_style))
    story.append(Paragraph(
        "Una vez que apruebas una hora extra con el PIN 2322, esa solicitud desaparece de 'Pendientes' y se traslada "
        "a la sub-pestaña <b>'Por Pagar (Aprobadas)'</b>.<br/>"
        "Ahí se van acumulando todas las horas de la quincena de cada muchacho. El día 15 o el día 30 del mes:<br/>"
        "1. Entras a <b>'Por Pagar'</b>.<br/>"
        "2. Verás la lista de cada colaborador con el dinero total de horas extra que le toca recibir.<br/>"
        "3. Pulsas el botón <b>[ Emitir Recibo de Pago ]</b> para pagárselas junto con su salario.<br/>"
        "4. En ese momento, esas horas pasan a la pestaña <b>'Pagadas'</b> donde quedan archivadas de por vida en el historial.",
        body_style
    ))

    story.append(box_alert(
        "<b>Regla de Oro:</b> Si una hora extra no está aprobada en el sistema, <b>no se paga</b>. "
        "Esto evita que se pague dinero de más o que se paguen tiempos no autorizados por la gerencia.",
        "POLÍTICA ESTRICTA DE CAJA",
        "danger"
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 5: CUADRO DE NÓMINA Y REPORTES
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 5: EL CUADRO DE NÓMINA GENERAL", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "El Cuadro de Nómina es la pantalla más completa del sistema. Para entrar, haz clic en la pestaña <b>'Nómina'</b> en el menú de arriba. "
        "Aquí puedes ver el resumen completo de todo el personal en cualquier rango de fechas.",
        body_style
    ))

    story.append(Paragraph("5.1 Herramientas Fáciles de Navegación", h2_style))
    story.append(Paragraph("• <b>Columna de Empleado Congelada (Sticky):</b> Cuando te muevas hacia la derecha para ver las 10 columnas del cuadro, el nombre y cargo del muchacho se quedan fijos a la izquierda. Nunca te vas a perder de fila.", bullet_style))
    story.append(Paragraph("• <b>Encabezados y Totales Fijos:</b> Al bajar en la lista, los títulos de las columnas y la fila de totales del restaurante se quedan siempre a la vista arriba y abajo.", bullet_style))
    story.append(Paragraph("• <b>Botones de Filtro por Área:</b> Arriba del cuadro hay botones para ver solo a un grupo de trabajadores: <i>[Todos] [🍳 Cocina & Parrilla] [🍽️ Salón & Servicio] [🍸 Caja & Barra] [🧹 Operaciones] [⭐ Gerencia]</i>.", bullet_style))
    story.append(Paragraph("• <b>Selector de Modo de Vista:</b> Puedes tocar <b>[Tabla Detallada]</b> para ver el cuadro completo en computadora, o tocar <b>[Vista Tarjetas]</b> para ver tarjetas individuales fáciles de leer en el celular.", bullet_style))
    story.append(Paragraph("• <b>Botón de Quincena Rápida:</b> No tienes que escribir fechas a mano. Toca el botón <b>[Planilla Quincenal]</b> y elige <i>1ra Quincena</i> (del 1 al 15) o <i>2da Quincena</i> (del 16 al fin de mes).", bullet_style))

    story.append(Paragraph("5.2 Qué Significa Cada una de las 10 Columnas del Cuadro", h2_style))
    col_help = [
        ("1. Empleado y Puesto", "El nombre completo del muchacho y su cargo en el restaurante (ej. Cocinero, Mesero, Bartender)."),
        ("2. Días Trabajados", "Los días en los que vino a trabajar y marcó entrada y salida en la quincena."),
        ("3. Días Libres", "Los días de descanso que tomó en la quincena."),
        ("4. Horas Ordinarias", "La suma de horas normales trabajadas (hasta 8 horas por turno)."),
        ("5. Feriados Trabajados", "Días de fiesta nacional que vino a trabajar. Muestra el letrero <b>+2d vac.</b> porque por ley se le regalan 2 días de vacaciones."),
        ("6. Vacaciones Pagadas", "Días de vacaciones que se le han pagado en efectivo. Tiene un botón <b>[+]</b> para pagarle vacaciones hoy mismo."),
        ("7. H. Extra Aprobadas", "Horas extra que el Jefe ya autorizó con el PIN 2322. Muestra aviso amarillo si rebasó las 9 horas semanales."),
        ("8. H. Extra por Aprobar", "Horas que los muchachos hicieron de más pero que el Jefe todavía no revisa. Si hay horas, sale un botón amarillo para ir a evaluarlas."),
        ("9. Horas Debidas (Bolsa)", "Horas que el muchacho le debe a la empresa por haber salido temprano de su turno de 8 horas."),
        ("10. Vacaciones Restantes", "Días de vacaciones disponibles que tiene acumulados para descansar o para pedir que se los paguen."),
    ]
    col_help_data = []
    for ct, cd in col_help:
        col_help_data.append([Paragraph(f"<b>{ct}</b>", body_bold), Paragraph(cd, body_style)])
    col_tbl = Table(col_help_data, colWidths=[140, 364])
    col_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,-1), COLOR_BG_ALT),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(col_tbl)
    story.append(Spacer(1, 6))

    story.append(Paragraph("5.3 Cómo Descargar la Planilla en Excel para Pagar", h2_style))
    story.append(Paragraph(
        "El día de pago, pulsa el botón blanco que dice <b>[Descargar Excel]</b> arriba del cuadro. "
        "En 2 segundos se descargará a tu computadora un archivo de Excel completo con el sueldo ordinario de cada quien, "
        "sus horas extra calculadas al doble, sus feriados y la retención del INSS laboral, listo para imprimir o hacer las transferencias.",
        body_style
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 6: VACACIONES, PERMISOS Y FERIADOS LEGALES
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 6: VACACIONES, PERMISOS Y FERIADOS", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "El Bodegón Pass calcula los descansos respetando estrictamente el Código del Trabajo de Nicaragua. "
        "Ni la empresa ni el colaborador pierden un solo día.",
        body_style
    ))

    story.append(Paragraph("6.1 La Regla de Acumulación de Vacaciones", h2_style))
    story.append(Paragraph(
        "Por ley en Nicaragua:<br/>"
        "• Cada trabajador gana <b>15 días de vacaciones por cada 6 meses continuos de trabajo</b>.<br/>"
        "• Eso significa que por cada mes completo que trabaja, el sistema le suma automáticamente <b>2.5 días</b> a su cuenta.<br/>"
        "El sistema toma la <b>Fecha de Ingreso</b> del muchacho y calcula sus días ganados en tiempo real sin que tengas que sacar cuentas en calculadora.",
        body_style
    ))

    story.append(Paragraph("6.2 Cómo Revisar el Historial de Vacaciones de un Empleado", h2_style))
    story.append(Paragraph("1. En el Cuadro de Nómina, busca al colaborador.", step_style))
    story.append(Paragraph("2. En la última columna que dice <b>'Vacaciones Restantes'</b>, haz clic en el botón verde con el número de días.", step_style))
    story.append(Paragraph("3. Se abrirá una ventana limpia con 5 casillas claras:", step_style))
    story.append(Paragraph("   • <b>Días Ganados:</b> Todo lo que ha acumulado desde que entró a trabajar.", bullet_style))
    story.append(Paragraph("   • <b>Días Tomados en Descanso:</b> Días que se fue de vacaciones a pasear.", bullet_style))
    story.append(Paragraph("   • <b>Días Pagados en Dinero:</b> Días que pidió que se los liquidaran en efectivo.", bullet_style))
    story.append(Paragraph("   • <b>Ajuste Manual:</b> Si el Administrador le sumó o restó días por alguna razón justificada.", bullet_style))
    story.append(Paragraph("   • <b>Saldo Neto Disponible:</b> Lo que le queda libre el día de hoy.", bullet_style))

    story.append(Paragraph("6.3 Cómo Pagar Vacaciones en Efectivo Paso a Paso", h2_style))
    story.append(Paragraph(
        "Si un trabajador acuerda con el Jefe que no quiere descansar y prefiere que le paguen sus días en dinero:<br/>"
        "1. En el Cuadro de Nómina, busca al muchacho y presiona el botón <b>[ + ]</b> en la columna 'Vacaciones Pagadas'.<br/>"
        "2. La pantalla te dirá cuántos días tiene disponibles y cuánto gana por día.<br/>"
        "3. Escribe cuántos días le vas a pagar (por ejemplo: <b>2.0</b> días). El sistema calculará el dinero exacto en Córdobas.<br/>"
        "4. Presiona <b>[ Emitir Pago de Vacaciones ]</b>.<br/>"
        "5. Se generará de inmediato el <b>Recibo Oficial de Pago de Vacaciones</b> con su número único para que lo imprimas y te lo firme. En ese mismo instante el sistema le descuenta los 2 días de su saldo.",
        body_style
    ))

    story.append(Paragraph("6.4 Los Días Feriados Nacionales", h2_style))
    story.append(Paragraph(
        "En Nicaragua los feriados de ley son: 1 de Enero, Jueves y Viernes Santo, 1 de Mayo, 19 de Julio, "
        "1 y 10 de Agosto (en Managua), 14 y 15 de Septiembre, 8 y 25 de Diciembre.<br/>"
        "<b>¿Qué pasa cuando alguien trabaja en feriado en El Bodegón?</b><br/>"
        "La tablet lo detecta automáticamente. Al muchacho se le paga su día de trabajo normal y el sistema "
        "<b>le regala 2 días completos a su saldo de vacaciones</b> como compensación legal.",
        body_style
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 7: GESTIÓN DE EMPLEADOS, ROSTROS Y CARNETS
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 7: METER EMPLEADOS NUEVOS Y CARNETS", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Cuando contratas a un nuevo mesero, cocinero o cajero, debes ingresarlo al sistema para que pueda empezar a marcar en la tablet.",
        body_style
    ))

    story.append(Paragraph("7.1 Cómo Crear el Expediente de un Empleado Nuevo", h2_style))
    story.append(Paragraph("1. En el menú de arriba, haz clic en <b>'Empleados'</b>.", step_style))
    story.append(Paragraph("2. Pulsa el botón verde que dice <b>[ + Nuevo Empleado ]</b>.", step_style))
    story.append(Paragraph("3. Escribe sus nombres, apellidos, número de cédula y teléfono.", step_style))
    story.append(Paragraph("4. Selecciona su <b>Cargo</b> (Cocinero, Mesero, Bartender, Limpieza, Cajero, etc.).", step_style))
    story.append(Paragraph("5. Elige su <b>Área de Trabajo</b> (Cocina, Salón, Caja/Barra, Operaciones o Gerencia).", step_style))
    story.append(Paragraph("6. Pon su <b>Salario</b> y la <b>Fecha de Ingreso</b> exacta en que empezó a laborar.", step_style))
    story.append(Paragraph("7. Asígnale un <b>PIN Personal de 4 números</b> (por ejemplo 1425) para que marque si no anda peinado o hay poca luz.", step_style))
    story.append(Paragraph("8. Pulsa <b>[ Guardar Empleado ]</b>.", step_style))

    story.append(Paragraph("7.2 Cómo Tomarle la Foto a su Cara para el Reconocimiento Facial", h2_style))
    story.append(Paragraph("1. En la lista de empleados, busca al nuevo muchacho y toca el botón azul <b>[ Capturar Rostro ]</b>.", step_style))
    story.append(Paragraph("2. Se prenderá la cámara web de la computadora o teléfono. Pídele al muchacho que mire al centro de la cámara con la cara seria y tranquila.", step_style))
    story.append(Paragraph("3. Verás que la cámara detecta los puntos de su cara.", step_style))
    story.append(Paragraph("4. Presiona <b>[ Guardar Rostro ]</b>. El sistema guardará su patrón facial de forma segura y desde ese momento la tablet de la entrada ya lo va a reconocer con solo pararse enfrente.", step_style))

    story.append(Paragraph("7.3 Cómo Sacar los Carnets y Gafetes con Código QR", h2_style))
    story.append(Paragraph(
        "Para que los muchachos anden identificados con su uniforme:<br/>"
        "1. En el menú de la izquierda o arriba, entra a <b>'Imprimir Carnets'</b>.<br/>"
        "2. La pantalla te mostrará los carnets diseñados con el logo de El Bodegón, foto del empleado, cargo, cédula y un <b>Código QR</b>.<br/>"
        "3. Pulsa el botón <b>[ Imprimir Carnets ]</b> en papel cartulina u opalina y mételos en sus gafetes plásticos.",
        body_style
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 8: POLÍTICAS DE BOLSA DE HORAS Y CONTROL GERENCIAL
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 8: LA BOLSA DE HORAS (SALIDAS TEMPRANO)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "La <b>Bolsa de Horas</b> es la cuenta donde se registran los minutos que un trabajador queda a deber si se va antes "
        "de terminar su turno de 8 horas.",
        body_style
    ))

    story.append(Paragraph("8.1 ¿Por qué el sistema ya no borra horas a escondidas?", h2_style))
    story.append(Paragraph(
        "En sistemas viejos, si un trabajador tenía 2 horas extra pendientes y un día salía 1 hora temprano, el software le borraba "
        "su hora extra sin avisarle a nadie. Eso provocaba reclamos y pleitos porque nadie sabía dónde había quedado el tiempo.<br/>"
        "<b>En El Bodegón Pass no se borra nada a escondidas:</b><br/>"
        "• Las horas extra solicitadas por el muchacho se quedan vivas en la lista de pendientes para que el Jefe las vea.<br/>"
        "• El tiempo que salió temprano se anota por separado en su <b>Bolsa de Horas</b> como deuda.",
        body_style
    ))

    story.append(Paragraph("8.2 Las 3 Salidas que el Jefe Puede Elegir", h2_style))
    story.append(Paragraph(
        "Cuando un muchacho tiene horas debidas en su Bolsa de Horas, el Jefe o Administrador puede elegir una de estas tres opciones:",
        body_style
    ))

    story.append(ui_mockup_box(
        "LAS 3 OPCIONES PARA RESOLVER HORAS DEBIDAS",
        [
            "✅ <b>OPCIÓN 1: Perdonar / Justificar la Salida:</b> Si el muchacho se fue temprano porque se sentía mal y trajo constancia médica del centro de salud, o porque el restaurante cerró temprano por lluvia torrencial, el Administrador abre su registro y le perdona el déficit escribiendo la justificación en comentarios.",
            "⏳ <b>OPCIÓN 2: Dejar las horas para que las reponga en otro turno:</b> El tiempo debido se queda en la Bolsa de Horas. El Administrador programa al trabajador para que el sábado o domingo entre 1 hora antes a picar verdura o apoyar en cocina, y así paga su deuda trabajando.",
            "⚖️ <b>OPCIÓN 3: Cruzar con Horas Extra Aprobadas:</b> Si el muchacho tiene horas extra aprobadas y también debe horas por haber salido temprano, al momento de pagar la quincena se cruzan las horas debidas contra sus horas extra en el recibo de pago con su firma de consentimiento."
        ],
        "Todo queda registrado en la bitácora con fecha y nombre de quién autorizó."
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 9 & 10: BODEGÓN CONTROL, SEGURIDAD Y RESPALDOS
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 9: CONTROL DE COMPRAS Y GASTOS", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Arriba a la derecha hay un botón color ámbar que dice <b>[ Bodegón Control ]</b>. "
        "Sirve para registrar las compras de insumos que se hacen en el día a día para que no se pierda ni un córdoba de la caja chica.",
        body_style
    ))
    story.append(Paragraph("1. Entra a <b>'Compras'</b> y toca el botón <b>[ Registrar Compra ]</b>.", step_style))
    story.append(Paragraph("2. Elige el proveedor o negocio donde compraste, pon el número de factura y la categoría (Carnes, Verduras, Licores, Abarrotes, etc.).", step_style))
    story.append(Paragraph("3. Indica si pagaste con efectivo de caja chica o con transferencia bancaria.", step_style))
    story.append(Paragraph("4. Tómale una foto a la factura con el celular o súbela desde la computadora para que quede el respaldo del gasto.", step_style))

    story.append(Spacer(1, 10))

    story.append(Paragraph("CAPÍTULO 10: RESPALDOS Y LIMPIEZA DEL SISTEMA", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("10.1 Cómo Descargar una Copia de Seguridad de la Base de Datos", h2_style))
    story.append(Paragraph(
        "Toda la información del restaurante está guardada de forma segura en la nube. Sin embargo, por precaución, "
        "<b>el Jefe debe descargar una copia de seguridad cada quincena</b>:<br/>"
        "1. En la barra superior, haz clic en el botón gris que dice <b>[ 💾 Respaldo BD ]</b>.<br/>"
        "2. En 2 segundos se descargará a tu computadora un archivo con todos los datos de empleados, horas y nóminas.<br/>"
        "3. Guarda ese archivo en una memoria USB o en tu correo personal. Con eso estás protegido ante cualquier falla de internet.",
        body_style
    ))

    story.append(Paragraph("10.2 Limpieza Semestral de Fotos Viejas", h2_style))
    story.append(Paragraph(
        "Como la tablet toma una foto cada vez que alguien marca, al cabo de 6 meses el servidor acumula miles de fotos. "
        "Para que la página web nunca se ponga lenta ni pesada, cada 6 meses saldrá una notificación en la campanita que dice <i>'Mantenimiento Semestral'</i>.<br/>"
        "• Al presionar el botón <b>[ 🧹 Ejecutar Depuración Semestral ]</b>, el sistema borra de forma segura las fotos viejas de hace más de 6 meses, "
        "<b>pero no borra ningún número, ni horas, ni salarios</b>. Todo el dinero y las asistencias se quedan intactos.",
        body_style
    ))

    story.append(PageBreak())

    # ═════════════════════════════════════════════════════════════════════════
    # CAPÍTULO 11: GUÍA RÁPIDA DE RESOLUCIÓN DE INCIDENCIAS (TROUBLESHOOTING)
    # ═════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("CAPÍTULO 11: ¿QUÉ HAGO SI...? (PROBLEMAS COMUNES)", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph(
        "Aquí tienes las respuestas rápidas a las 9 situaciones más comunes que te pueden pasar en el restaurante:",
        body_style
    ))

    faq_data = [
        [Paragraph("Problema que Ocurre", table_th_style), Paragraph("¿Por qué pasó?", table_th_style), Paragraph("¿Qué hago para resolverlo?", table_th_style)],
        [
            Paragraph("La tablet no reconoce la cara del muchacho", table_td_style),
            Paragraph("Poca luz, cámara con grasa o trae gorra/lentes.", table_td_style),
            Paragraph("Dile que toque <b>[Ingresar con PIN]</b> y ponga sus 4 números. Luego limpia el lente de la tablet con un paño.", table_td_style)
        ],
        [
            Paragraph("Alguien se quedó 15 minutos más y no le sale hora extra", table_td_style),
            Paragraph("Regla de umbral mínimo de 30 minutos.", table_td_style),
            Paragraph("No es un error: las horas extra solo empiezan a contar a partir de 30 minutos después de las 8 horas normales.", table_td_style)
        ],
        [
            Paragraph("Un colaborador se fue anoche y no marcó salida", table_td_style),
            Paragraph("Se le olvidó marcar por irse a la carrera.", table_td_style),
            Paragraph("Toca la campanita de alertas arriba a la derecha y pulsa el botón <b>[ 🌙 Cerrar 11:00 PM ]</b>.", table_td_style)
        ],
        [
            Paragraph("Un trabajador tiene horas en 'Horas Debidas / Bolsa'", table_td_style),
            Paragraph("Marcó salida antes de cumplir 8.0 horas.", table_td_style),
            Paragraph("Pregúntale por qué salió temprano. Decide si le perdonas las horas (si andaba enfermo) o si se las programas para reponer.", table_td_style)
        ],
        [
            Paragraph("Aprobé una hora extra sin querer y me equivoqué", table_td_style),
            Paragraph("Error de dedo al presionar el botón.", table_td_style),
            Paragraph("Ve a Nómina -> Horas Extra -> sub-pestaña 'Por Pagar'. Busca la fila y pulsa <b>[Modificar]</b> o <b>[Anular]</b>.", table_td_style)
        ],
        [
            Paragraph("La tablet muestra la pantalla de la cámara en negro", table_td_style),
            Paragraph("El navegador bloqueó el permiso de la cámara.", table_td_style),
            Paragraph("Toca el candadito que sale arriba en la barra de internet y asegúrate de que el permiso de <b>Cámara</b> diga 'Permitir'.", table_td_style)
        ],
        [
            Paragraph("No coinciden las vacaciones de un empleado viejo", table_td_style),
            Paragraph("Su fecha de ingreso estaba mal escrita.", table_td_style),
            Paragraph("Entra a 'Empleados', edita su perfil y pon la <b>Fecha de Ingreso</b> real en que empezó a trabajar en el negocio.", table_td_style)
        ],
        [
            Paragraph("El archivo de Excel de la quincena no se descarga", table_td_style),
            Paragraph("Tu navegador tiene bloqueadas las descargas.", table_td_style),
            Paragraph("Permite las descargas automáticas en Google Chrome o Microsoft Edge en tu computadora.", table_td_style)
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
    story.append(Paragraph("CAPÍTULO 12: LISTA DE TAREAS Y RUTINAS", h1_style))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    story.append(Paragraph("12.1 Rutina Diaria del Administrador de Turno", h2_style))
    adm_checklist = [
        "<b>Al Iniciar Turno (Apertura por la mañana o relevo de tarde):</b><br/>"
        "[ ] Limpiar el lente de la cámara de la tablet con un paño suave.<br/>"
        "[ ] Verificar que la tablet tenga internet WiFi y esté conectada a su cargador.<br/>"
        "[ ] Abrir la pantalla de 'Asistencia' en la computadora o celular y revisar que los muchachos programados ya tengan su Entrada en verde.",
        "<b>A Mediodía / Durante el Turno de Comida:</b><br/>"
        "[ ] Vigilar que los cocineros y meseros marquen [Inicio Comida] y [Fin Comida] para que no se les descuenten horas de más.<br/>"
        "[ ] Revisar si la campanita de arriba tiene alertas de tardanza.",
        "<b>Al Finalizar el Turno y Cierre del Restaurante:</b><br/>"
        "[ ] Constatar que todo el personal que se retira haya tocado [SALIDA] en la tablet.<br/>"
        "[ ] Si alguien olvidó marcar salida, abrir la campanita y pulsar el botón <b>[ 🌙 Cerrar 11:00 PM ]</b>.<br/>"
        "[ ] Dejar la tablet del Kiosco cargando para el turno siguiente.",
    ]
    for chk in adm_checklist:
        story.append(Paragraph(chk, body_style))
        story.append(Spacer(1, 4))

    story.append(Paragraph("12.2 Rutina del Jefe / Gerente General (Lunes y Quincenas)", h2_style))
    boss_checklist = [
        "<b>Todos los Lunes por la Mañana (Revisión de Horas):</b><br/>"
        "[ ] Entrar a Nómina -> pestaña 'Horas Extra' -> 'Solicitudes Pendientes'.<br/>"
        "[ ] Revisar las horas de la semana pasada con el botón amarillo [ Evaluar ].<br/>"
        "[ ] Poner el PIN Maestro <b>2322</b> para aprobar o rechazar las horas de los muchachos.<br/>"
        "[ ] Imprimir las Boletas Oficiales para que los colaboradores las firmen.",
        "<b>Los Días de Pago de Quincena (Días 15 y último de mes):</b><br/>"
        "[ ] En el Cuadro de Nómina, tocar 'Planilla Quincenal' y elegir la quincena a pagar.<br/>"
        "[ ] Revisar que los días trabajados y horas de cada quien estén completos.<br/>"
        "[ ] En la pestaña Horas Extra -> 'Por Pagar', liquidar los montos de horas extra aprobadas.<br/>"
        "[ ] Si algún muchacho pidió pago de vacaciones en efectivo, emitir el recibo con el botón [+].<br/>"
        "[ ] Pulsar <b>[Descargar Excel]</b> para tener la planilla lista para el banco o para pagar en sobre.<br/>"
        "[ ] Pulsar <b>[ 💾 Respaldo BD ]</b> para guardar una copia de seguridad en tu computadora.",
    ]
    for chk in boss_checklist:
        story.append(Paragraph(chk, body_style))
        story.append(Spacer(1, 4))

    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=COLOR_PRIMARY, spaceBefore=4, spaceAfter=8))
    story.append(Paragraph(
        "<b>RESTAURANTE & BAR EL BODEGÓN</b><br/>"
        "Sistema El Bodegón Pass v2.0 • Desarrollado para la Excelencia Operativa y el Cumplimiento Laboral.<br/>"
        "<i>Cualquier persona que lea este manual tiene la capacidad de operar el sistema con seguridad y confianza.</i>",
        ParagraphStyle('EndFooter', parent=body_style, alignment=1, fontSize=8, textColor=COLOR_MUTED)
    ))

    # Construir documento final con NumberedCanvas
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"[OK] Manual 100% humano y operativo generado exitosamente en: {output_path}")

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, '../../'))

    public_target = os.path.join(project_root, 'frontend/public/manual_el_bodegon_pass.pdf')
    root_target = os.path.join(project_root, 'Manual_de_Usuario_El_Bodegon_Pass.pdf')

    build_pdf_manual(public_target)
    build_pdf_manual(root_target)
