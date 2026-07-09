-- ==========================================================================
--  Migración 05 — Gente de T1 (directorio de personas) + rango de importancia
--  Ejecútala en Supabase → SQL Editor → New query (una sola vez).
--  Idempotente: puedes correrla de nuevo sin duplicar.
-- ==========================================================================

-- 1) Campo de orden por importancia (CEO = 1; menor = más arriba).
alter table public.personas add column if not exists rango int not null default 100;

-- 2) Alta de la gente de T1 (no duplica si ya existe el correo).
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
