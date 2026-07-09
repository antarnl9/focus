-- ==========================================================================
--  Migración 06 — Reemplaza la plantilla del día del COO
--  Ejecútala en Supabase → SQL Editor → New query.
-- ==========================================================================

-- Borra la plantilla actual del COO.
delete from public.day_blocks
where user_id = (select id from public.users where email = 'antar@t1.com' limit 1);

-- Inserta el nuevo horario.
insert into public.day_blocks (user_id, hora_ini, hora_fin, label, tipo, orden)
select u.id, v.hi, v.hf, v.label, v.tipo, v.orden
from (values
  ('10:30','11:00','Planeación','fija',0),
  ('11:00','11:30','Junta reportes T1','fija',1),
  ('11:30','12:00','Revisión Greg/Alfonso','fija',2),
  ('12:00','13:00','Dudas','dudas',3),
  ('13:00','14:30','Flexible','flex',4),
  ('14:30','16:00','Bloqueado (definición)','protegido',5),
  ('16:00','17:00','T1 Merch','fija',6),
  ('17:00','18:00','T1 Global','fija',7),
  ('18:00','19:00','Dudas','dudas',8),
  ('19:00','19:30','Seguimiento comercial','fija',9),
  ('19:30','21:00','Flexible 2','flex',10)
) as v(hi, hf, label, tipo, orden)
cross join (select id from public.users where email = 'antar@t1.com' limit 1) u;
