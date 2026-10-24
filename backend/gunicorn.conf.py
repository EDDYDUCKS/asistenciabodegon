# Gunicorn lo carga solo al arrancar desde backend/ (Render: rootDir=backend).
# El plan gratis tiene un solo worker; con hilos atiende varias peticiones a la vez
# (el panel pide hasta 9 listados en paralelo) mientras otras esperan a la base de datos.
import os

workers = int(os.getenv('WEB_CONCURRENCY', '1'))
worker_class = 'gthread'
threads = int(os.getenv('GUNICORN_THREADS', '4'))
timeout = 60
