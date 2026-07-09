-- ==========================================================================
--  KPIs de la empresa: miércoles 11:00-12:00 (protegido / inamovible)
--  Requiere haber corrido antes la migración 07 (columna dias).
-- ==========================================================================

-- Agrega el bloque solo los miércoles (dias = {3}).
insert into public.day_blocks (user_id, hora_ini, hora_fin, label, tipo, dias, orden)
select id, '11:00', '12:00', 'KPIs de la empresa', 'protegido', array[3], 15
from public.users where email = 'antar@t1.com';

-- Para que no se encimen, Junta reportes y Revisión Greg/Alfonso se quitan
-- de los miércoles (quedan lun, mar, jue, vie).
update public.day_blocks
set dias = array[1,2,4,5]
where user_id = (select id from public.users where email = 'antar@t1.com')
  and label in ('Junta reportes T1', 'Revisión Greg/Alfonso');
