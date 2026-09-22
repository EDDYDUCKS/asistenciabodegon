import psycopg2

db_url = 'postgresql://postgres.kwkyvdoacselhbrnvney:epFvM4aRpRsTrlmL@aws-0-us-east-1.pooler.supabase.com:6543/postgres'

sql = """
-- 1. Tabla de Jornadas Diarias (Turnos / Caja Chica)
CREATE TABLE IF NOT EXISTS public.jornadas_diarias (
    id BIGSERIAL PRIMARY KEY,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    turno VARCHAR(30) NOT NULL DEFAULT 'COMPLETO',
    estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTA',
    fondo_inicial NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_gastos_efectivo NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_gastos_transferencia NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    responsable VARCHAR(120) NOT NULL DEFAULT 'Restaurante El Bodegón',
    observaciones TEXT,
    fecha_cierre TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabla de Compras y Gastos Operativos
CREATE TABLE IF NOT EXISTS public.compras_gastos (
    id BIGSERIAL PRIMARY KEY,
    jornada_id BIGINT REFERENCES public.jornadas_diarias(id) ON DELETE SET NULL,
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    concepto VARCHAR(255) NOT NULL,
    categoria VARCHAR(60) NOT NULL DEFAULT 'OTROS',
    proveedor VARCHAR(150),
    monto NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    metodo_pago VARCHAR(40) NOT NULL DEFAULT 'EFECTIVO',
    estado_pago VARCHAR(40) NOT NULL DEFAULT 'PAGADO',
    foto_comprobante TEXT,
    referencia_banco VARCHAR(120),
    registrado_por VARCHAR(100) NOT NULL DEFAULT 'Administración',
    observaciones TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices para busqueda rapida
CREATE INDEX IF NOT EXISTS idx_compras_fecha_hora ON public.compras_gastos (fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_compras_categoria ON public.compras_gastos (categoria);
CREATE INDEX IF NOT EXISTS idx_compras_metodo ON public.compras_gastos (metodo_pago);
CREATE INDEX IF NOT EXISTS idx_compras_estado ON public.compras_gastos (estado_pago);
CREATE INDEX IF NOT EXISTS idx_compras_jornada ON public.compras_gastos (jornada_id);
CREATE INDEX IF NOT EXISTS idx_jornadas_fecha ON public.jornadas_diarias (fecha DESC);

-- Habilitar RLS en ambas tablas
ALTER TABLE public.jornadas_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras_gastos ENABLE ROW LEVEL SECURITY;

-- Politicas RLS para permitir acceso tanto anon como authenticated
DROP POLICY IF EXISTS "Permitir acceso publico a jornadas" ON public.jornadas_diarias;
CREATE POLICY "Permitir acceso publico a jornadas" ON public.jornadas_diarias
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir acceso publico a compras" ON public.compras_gastos;
CREATE POLICY "Permitir acceso publico a compras" ON public.compras_gastos
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Agregar tablas a la publicacion de supabase_realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'compras_gastos'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.compras_gastos;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'jornadas_diarias'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.jornadas_diarias;
    END IF;
END
$$;
"""

def main():
    print("Conectando a Supabase PostgreSQL...")
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cur = conn.cursor()
    print("Ejecutando DDL de tablas aisladas...")
    cur.execute(sql)
    print("Tablas y políticas RLS creadas exitosamente!")
    
    # Verificar inserción inicial de jornada si no existe
    cur.execute("SELECT COUNT(*) FROM public.jornadas_diarias;")
    count = cur.fetchone()[0]
    print(f"Jornadas existentes: {count}")
    if count == 0:
        cur.execute("""
            INSERT INTO public.jornadas_diarias (fecha, turno, estado, fondo_inicial, responsable, observaciones)
            VALUES (CURRENT_DATE, 'COMPLETO', 'ABIERTA', 1000.00, 'Administración El Bodegón', 'Jornada inicial de arranque');
        """)
        print("Jornada inicial creada!")
        
    conn.close()

if __name__ == '__main__':
    main()
