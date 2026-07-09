-- ==========================================================================
--  T1 Focus — TODAS las migraciones en orden, SEGURAS de re-correr.
--  Pégala completa en Supabase → SQL Editor → Run. Correrla otra vez no
--  borra nada tuyo (el calendario solo se siembra si está vacío).
--  Requiere que schema.sql (la base) ya se haya corrido.
--  Cambia 'antar@t1.com' abajo si tu correo de login es otro.
-- ==========================================================================

-- 01 · grabaciones: columna persona
alter table public.grabaciones add column if not exists persona text;

-- 02 · directorio de personas + ligado muchos-a-muchos con grabaciones
create table if not exists public.personas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  nombre        text not null,
  puesto        text,
  correo        text,
  slack_user_id text,
  descripcion   text,
  created_at    timestamptz not null default now()
);
create index if not exists personas_user_idx on public.personas (user_id, nombre);
create table if not exists public.grabacion_personas (
  grabacion_id uuid not null references public.grabaciones (id) on delete cascade,
  persona_id   uuid not null references public.personas (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (grabacion_id, persona_id)
);
create index if not exists grabacion_personas_persona_idx on public.grabacion_personas (persona_id);
alter table public.personas enable row level security;
alter table public.grabacion_personas enable row level security;
drop policy if exists personas_owner on public.personas;
create policy personas_owner on public.personas
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists grabacion_personas_owner on public.grabacion_personas;
create policy grabacion_personas_owner on public.grabacion_personas
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 03 · tipo de persona + perfil del COO
alter table public.personas add column if not exists tipo text not null default 'interno'
  check (tipo in ('interno', 'cliente', 'proveedor', 'otro'));
alter table public.users add column if not exists titulo text;
alter table public.users add column if not exists objetivo text;
alter table public.users add column if not exists bio text;

-- 04 · negocios / unidades de T1
create table if not exists public.negocios (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  nombre         text not null,
  contexto       text,
  objetivo_anual text,
  orden          int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists negocios_user_idx on public.negocios (user_id, orden);
alter table public.negocios enable row level security;
drop policy if exists negocios_owner on public.negocios;
create policy negocios_owner on public.negocios
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 07 · columna dias en day_blocks (va antes de sembrar KPIs, que la usa)
alter table public.day_blocks add column if not exists dias int[];

-- 05 · rango de importancia + alta de las 49 personas de T1 (idempotente por correo)
alter table public.personas add column if not exists rango int not null default 100;
insert into public.personas (user_id, nombre, correo, slack_user_id, puesto, tipo, rango)
select u.id, v.nombre, v.correo, v.slack, v.puesto, 'interno', v.rango
from (values
  ('Arturo Elias Slim', 'arturo@t1.com', 'U0AFKE983DY', 'CEO', 1),
  ('Francisco Miguel Aramburo Torres', 'francisco.aramburo@t1.com', 'U0AFUL22PGU', 'CTO', 3),
  ('Abraham Mejia Gervacio', 'abraham.mejia@t1.com', 'U0B4RSG29QU', 'Director Comercial', 10),
  ('Jose Luis Dorantes Ramirez', 'jose.dorantes@t1.com', 'U0AG6AYUQ4W', 'Director De Pagos Y Prevención De Fraude', 10),
  ('Rafael De Jesus Hernandez Meza', 'rafael.hernandez@t1.com', 'U0AFML1JK29', 'Director De Sistemas', 10),
  ('Steb Morales Alarcon', 'steb.alarcon@t1.com', 'U0AFT5PHG7R', 'Director Comercial', 10),
  ('Miguel Angel Alaniz Chavez', 'miguel.alaniz@t1.com', 'U0AG6EJNZ4H', 'Contralor', 12),
  ('Agustin Ortiz Monasterio Rivero', 'agustin.ortizmonasterio@t1.com', 'U0B5Z6AN6F2', 'Head of Fulfillment Product', 15),
  ('Gregorio Romero Romero', 'gregorio.romero@t1.com', 'U0AG219HDV1', 'Gerente de Operaciones', 20),
  ('Iñaki Salvador Sanchez Kuri', 'inaki.sanchez@t1.com', 'U0AFHBHSRUN', 'Gerente De Proyecto', 20),
  ('Karla Cristina Salazar Salazar', 'karla.salazar@t1.com', 'U0AH2LYQUM6', 'Gerente De UX', 20),
  ('Maria Fernanda Valdes Moreno', 'fernanda.valdes@t1.com', 'U0AGDNE1P1N', 'Gerente De Recursos Humanos', 20),
  ('Natalia Ruiz Garcia', 'natalia.ruiz@t1.com', 'U0AG20ZD6D9', 'Gerente de  Marketing & Diseño Digital', 20),
  ('Irving Ariel Marin Salazar', 'irving.marin@t1.com', 'U0AFMRZURNH', 'Senior Product Owner', 25),
  ('Gerardo Manuel Izquierdo Soto', 'gerardo.izquierdo@t1.com', 'U0AKVEJJK4Z', 'Lider Cientifico de Datos', 27),
  ('Alonso Charbel Moncada', 'alonso.charbel@t1.com', 'U0AH2M0UN1E', 'Product Owner', 30),
  ('Juan Felipe Caicedo Obando', 'juan.caicedo@t1.com', 'U0B22UR6ZNW', 'Product Owner', 30),
  ('Alfonso Cardenas Fierro', 'alfonso.cardenas@t1.com', 'U0B4DUEEJKV', 'Customer Success  Manager', 32),
  ('Ana Llely Hernandez Hernandez', 'ana.hernandez@t1.com', 'U0AFT5SKCR5', 'Tecnología', 50),
  ('Arturo Isaac Perez Rosales', 'arturo.rosales@t1.com', 'U0AGMAERV3K', 'Tecnología', 50),
  ('Carlos Jorge Martin Arteaga', 'carlos.martin@t1.com', 'U0AG2777NAX', 'Tecnología', 50),
  ('Daniel Villanueva Moreno', 'daniel.villanueva@t1.com', 'U0AH2LWGT4Y', 'Tecnología', 50),
  ('Diego Marin Mendoza', 'diego.marin@t1.com', 'U0AFSV54B8F', 'Tecnología', 50),
  ('Edgar Fuentes Alvarez', 'edgar.fuentes@t1.com', 'U0AFT5H9RGF', 'Tecnología', 50),
  ('Edilberto Huerta Niño', 'edilberto.huerta@t1.com', 'U0AG8CUF6P4', 'Tecnología', 50),
  ('Emmanuelle Laguna Marin', 'emmanuelle.laguna@t1.com', 'U0AG216STSP', 'Tecnología', 50),
  ('Fernando Martinez Castellanos', 'fernando.martinez@t1.com', 'U0AFR3CAUSW', 'Tecnología', 50),
  ('Gustavo Garcia Gomez', 'gustavo.garcia@t1.com', 'U0AG6H1A3P0', 'Tecnología', 50),
  ('Isnardo Lugardo Cortes', 'isnardo.lugardo@t1.com', 'U0AG8CSPZ0A', 'Tecnología', 50),
  ('Jecsan Abdel Romero Ortega', 'jecsan.romero@t1.com', 'U0AG8CZ68R0', 'Tecnología', 50),
  ('Jesus Daniel Ochoa Virgen', 'jesus.ochoa@t1.com', 'U0AN2G6AR40', 'Tecnología', 50),
  ('Jorge Luis Alonso Hernandez', 'jorge.alonso@t1.com', 'U0AG273V1AP', 'Tecnología', 50),
  ('Jose Luis Gomez Jaen', 'jose.gomez@t1.com', 'U0AG8CU67BL', 'Tecnología', 50),
  ('Juan Angel Martinez Lopez', 'juan.martinez@t1.com', 'U0AG50D217X', 'Tecnología', 50),
  ('Juan Carlos Guzman Ramirez', 'juancarlos.guzman@t1.com', 'U0AG8CXTR1Q', 'Tecnología', 50),
  ('Julio Cesar Lopez Quiroz', 'cesar.lopez@t1.com', 'U0AG50CDCHK', 'Tecnología', 50),
  ('Julio Miguel Marrufo Ocaña', 'julio.marrufo@t1.com', 'U0AG50BQLF7', 'Tecnología', 50),
  ('Lisset America Galindo Chavez', 'lisset.galindo@t1.com', 'U0AFSUSSD1V', 'Tecnología', 50),
  ('Luis Angel Galvan Benavides', 'luis.galvan@t1.com', 'U0AGMG9QB4H', 'Tecnología', 50),
  ('Luis Donaldo Solano Gomez', 'donaldo.gomez@t1.com', 'U0AH2M359B2', 'Tecnología', 50),
  ('Luis Fidel Escobar Ambrosio', 'luis.escobar@t1.com', 'U0AG8JWMCBU', 'Tecnología', 50),
  ('Manuel Roberto Serrano Torres', 'manuel.serrano@t1.com', 'U0B6W8T806L', 'Tecnología', 50),
  ('Maria Guadalupe Policarpo Genchi', 'maria.policarpo@t1.com', 'U0AG27A5ZJ7', 'Tecnología', 50),
  ('Mario Alberto Cardenas Ramirez', 'mario.cardenas@t1.com', 'U0AGC196K8U', 'Tecnología', 50),
  ('Mario Antonio Manzanarez Sanchez', 'mario.manzanarez@t1.com', 'U0AH2M02AQY', 'Tecnología', 50),
  ('Oscar Caballero Trejo', 'oscar.caballero@t1.com', 'U0AG27805JP', 'Tecnología', 50),
  ('Roberto Martinez Sanchez', 'roberto.martinez@t1.com', 'U0AG27B8L7M', 'Tecnología', 50),
  ('Salvador Daniel Garcia Rivas', 'daniel.garcia@t1.com', 'U0AG21EPLF5', 'Tecnología', 50),
  ('Sergio Garza Martinez', 'sergio.garza@t1.com', 'U0AGC7CSGHJ', 'Tecnología', 50)
) as v(nombre, correo, slack, puesto, rango)
cross join (select id from public.users where email = 'antar@t1.com' limit 1) u
where not exists (
  select 1 from public.personas p where p.user_id = u.id and lower(p.correo) = v.correo
);

-- 06 + 08 · plantilla del día + bloque KPIs. SOLO si aún no tienes bloques
-- (no pisa tu calendario si ya lo ajustaste).
do $seed$
declare uid uuid;
begin
  select id into uid from public.users where email = 'antar@t1.com' limit 1;
  if uid is not null and not exists (select 1 from public.day_blocks where user_id = uid) then
    insert into public.day_blocks (user_id, hora_ini, hora_fin, label, tipo, orden) values
      (uid,'10:30','11:00','Planeación','fija',0),
      (uid,'11:00','11:30','Junta reportes T1','fija',1),
      (uid,'11:30','12:00','Revisión Greg/Alfonso','fija',2),
      (uid,'12:00','13:00','Dudas','dudas',3),
      (uid,'13:00','14:30','Flexible','flex',4),
      (uid,'14:30','16:00','Bloqueado (definición)','protegido',5),
      (uid,'16:00','17:00','T1 Merch','fija',6),
      (uid,'17:00','18:00','T1 Global','fija',7),
      (uid,'18:00','19:00','Dudas','dudas',8),
      (uid,'19:00','19:30','Seguimiento comercial','fija',9),
      (uid,'19:30','21:00','Flexible 2','flex',10);
    insert into public.day_blocks (user_id, hora_ini, hora_fin, label, tipo, dias, orden)
      values (uid,'11:00','12:00','KPIs de la empresa','protegido',array[3],15);
    update public.day_blocks set dias = array[1,2,4,5]
      where user_id = uid and label in ('Junta reportes T1','Revisión Greg/Alfonso');
  end if;
end $seed$;

-- 09 + 10 · contexto de Slack (resumen + recomendaciones; NO guarda mensajes crudos)
create table if not exists public.slack_context (
  user_id         uuid primary key references public.users (id) on delete cascade,
  resumen         text,
  recomendaciones text,
  mensajes        int not null default 0,
  actualizado     timestamptz
);
alter table public.slack_context add column if not exists recomendaciones text;
alter table public.slack_context enable row level security;
drop policy if exists slack_context_owner on public.slack_context;
create policy slack_context_owner on public.slack_context
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 11 · dos dailies (CEO / personal) + historial
alter table public.dailies add column if not exists tipo text not null default 'ceo'
  check (tipo in ('ceo', 'personal'));
drop index if exists dailies_user_fecha_idx;
create unique index if not exists dailies_user_fecha_tipo_idx on public.dailies (user_id, fecha, tipo);
