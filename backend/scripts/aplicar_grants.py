import psycopg2

db_url = 'postgresql://postgres.kwkyvdoacselhbrnvney:epFvM4aRpRsTrlmL@aws-0-us-east-1.pooler.supabase.com:6543/postgres'

sql_grants = """
-- Conceder permisos de tabla a los roles de Supabase (anon, authenticated, service_role)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON TABLE public.jornadas_diarias TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.compras_gastos TO anon, authenticated, service_role;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- Refrescar esquema para PostgREST
NOTIFY pgrst, 'reload schema';
"""

def main():
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cur = conn.cursor()
    print("Aplicando permisos GRANT a anon y authenticated...")
    cur.execute(sql_grants)
    print("Permisos concedidos y esquema de PostgREST recargado exitosamente!")
    conn.close()

if __name__ == '__main__':
    main()
