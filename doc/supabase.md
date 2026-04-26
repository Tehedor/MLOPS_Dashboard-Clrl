- [Supabase](#supabase)
- [Pasos](#pasos)
  - [1. Crear organización con plan gratuito](#1-crear-organización-con-plan-gratuito)
  - [2. Crear proyecto](#2-crear-proyecto)
    - [3. Credenciales y Claves de Acceso](#3-credenciales-y-claves-de-acceso)
  - [4. URL de supabase](#4-url-de-supabase)
  - [5. Crear tabla y estrucutra de los datos](#5-crear-tabla-y-estrucutra-de-los-datos)
  - [5. Políticas de RLS (Row Level Security).](#5-políticas-de-rls-row-level-security)
    - [6. Configuración de Seguridad y Mantenimiento (Supabase)](#6-configuración-de-seguridad-y-mantenimiento-supabase)
      - [6.1. Políticas de Row Level Security (RLS)](#61-políticas-de-row-level-security-rls)
      - [6.2. Automatización de Limpieza de Logs (Trigger)](#62-automatización-de-limpieza-de-logs-trigger)

# Supabase
[url](https://supabase.com/)


# Pasos
## 1. Crear organización con plan gratuito
## 2. Crear proyecto

<img src="images/crearProyecto.png" alt="Description" height="350">

### 3. Credenciales y Claves de Acceso
> Poryect settings -> Api Keys

<img src="images/apiKeys.png" alt="Description" height="350">

- Publishable key (Client / Frontend Key):
Destino: backend/.env o frontend/.env. - SUPABASE_PUBLISHABLE_KEY

    + Uso: Se utiliza en la aplicación de control (lado del cliente). Esta clave es pública por diseño. Solo permite realizar operaciones que estén autorizadas por las políticas de RLS (Row Level Security) que hayamos definido en las tablas. Es segura de incluir en el código del navegador o apps distribuidas.

- Secret key (Service Role Key):
Destino: GitHub Secrets (Settings > Secrets and variables > Actions). - SUPABASE_SECRET_KEY

    + Uso: Es una clave de administrador. Se utiliza exclusivamente en entornos seguros y privados (como GitHub Actions). Tiene permisos para saltarse todas las políticas de RLS y realizar cualquier operación (lectura, escritura, borrado total) en la base de datos.

    >⚠️ ADVERTENCIA: Nunca debe incluirse en el código de la aplicación cliente ni exponerse públicamente.

## 4. URL de supabase
> Poryect settings -> Data api -> Api url

- Ctrl App
Proyect -> backend/.env - SUPABASE_URL

- Github
Para que tus GitHub Actions sepan a dónde enviar los logs, debes guardarla como un secreto del repositorio:

a. Ve a tu repositorio en GitHub.

b. Haz clic en Settings (la pestaña superior del repo).

c. En el menú lateral izquierdo, busca Secrets and variables > Actions.

d. Haz clic en el botón verde New repository secret.

e. Crea un secreto llamado SUPABASE_URL y pega la URL que copiaste.

## 5. Crear tabla y estructura de los datos

Ver modelo de datos en `.agent/30_Servicio3_logsRunners.md`.

## 6. Políticas de RLS (Row Level Security).

### 6.1. Configuración de Seguridad y Mantenimiento (Supabase)

Para finalizar la configuración de la base de datos, es necesario establecer las políticas de acceso público de lectura (RLS) y automatizar la limpieza de registros para no exceder el límite de almacenamiento de la capa gratuita (500 MB).

Dirigirse a **SQL Editor** en el panel de Supabase y ejecutar los siguientes scripts:

#### 6.1. Políticas de Row Level Security (RLS)
Habilita la lectura de datos para las aplicaciones cliente que utilizan la `Publishable key` (anon), manteniendo bloqueada la escritura pública.


#### 6.2. Automatización de Limpieza de Logs (Trigger)
Implementa una rutina automática que elimina los registros con más de 7 días de antigüedad cada vez que se inserta un nuevo log.

> **Nota:** El intervalo `'7 days'` puede ajustarse según el volumen de operaciones y los requisitos de auditoría del proyecto.

Y apretamos en `run`

Todo para copiar y pegar:
```sql
--------------------------------------------------------
-- 1. CREACIÓN DE TABLAS (Alineado con GitHub Actions)
--------------------------------------------------------

-- Tabla para los estados de las ejecuciones (Usando el run_id de GitHub como PK)
CREATE TABLE workflow_runs (
  run_id bigint PRIMARY KEY,
  repo text NOT NULL,
  branch text,
  workflow_name text,
  fase text,
  variant text,
  status text NOT NULL DEFAULT 'queued',
  conclusion text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Tabla para los logs masivos (Enlazada al run_id de GitHub)
CREATE TABLE workflow_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id bigint NOT NULL REFERENCES workflow_runs(run_id) ON DELETE CASCADE,
  step_name text,
  line_no int,
  content text NOT NULL,
  ts timestamp with time zone DEFAULT now()
);

-- Índice para acelerar la lectura de logs en el frontend
CREATE INDEX ON workflow_logs(run_id, line_no);


--------------------------------------------------------
-- 2. POLÍTICAS DE SEGURIDAD (RLS)
--------------------------------------------------------
-- Activar el escudo RLS
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_logs ENABLE ROW LEVEL SECURITY;

-- Permitir a las aplicaciones cliente (anon) lectura de estados
CREATE POLICY "Allow client read access for runs"
ON workflow_runs FOR SELECT
TO anon
USING (true);

-- Permitir a las aplicaciones cliente (anon) lectura de logs
CREATE POLICY "Allow client read access for logs"
ON workflow_logs FOR SELECT
TO anon
USING (true);


--------------------------------------------------------
-- 3. ACTIVAR REALTIME (TIEMPO REAL)
--------------------------------------------------------
-- Añade las tablas al canal de publicación para que los 
-- clientes reciban los eventos en directo vía WebSockets.

ALTER PUBLICATION supabase_realtime ADD TABLE workflow_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_logs;


--------------------------------------------------------
-- 4. AUTOMATIZACIÓN DE LIMPIEZA DE LOGS (TRIGGER)
--------------------------------------------------------
-- Implementa una rutina automática que elimina los registros con 
-- más de 7 días de antigüedad para proteger el Free Tier de 500MB.

-- 4.1 Crear función de eliminación basada en antigüedad
CREATE OR REPLACE FUNCTION clean_old_logs()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM workflow_logs WHERE ts < NOW() - INTERVAL '7 days';
  DELETE FROM workflow_runs
    WHERE updated_at < NOW() - INTERVAL '30 days'
      AND conclusion IS NOT NULL;
  RETURN NULL;  -- requerido para triggers FOR EACH STATEMENT
END;
$$ LANGUAGE plpgsql;

-- 4.2 Asociar la función a un trigger de inserción en la tabla de logs
-- FOR EACH STATEMENT: se dispara una vez por sentencia INSERT, no por fila.
CREATE TRIGGER trigger_clean_old_logs
AFTER INSERT ON workflow_logs
FOR EACH STATEMENT EXECUTE FUNCTION clean_old_logs();
```