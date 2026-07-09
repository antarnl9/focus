// Utilidades de tiempo en zona America/Mexico_City.
// Todo lo que ve el COO se calcula en hora local de CDMX.

export const TZ = 'America/Mexico_City';

/** Devuelve {y,m,d,hh,mm,weekday} en hora local de CDMX para un instante dado. */
export function localParts(date: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    hh: Number(get('hour')),
    mm: Number(get('minute')),
    weekday: weekdayMap[get('weekday')] ?? 0,
  };
}

/** Fecha local 'YYYY-MM-DD' en CDMX. */
export function localDateStr(date: Date = new Date()): string {
  const p = localParts(date);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Hora local 'HH:MM' en CDMX. */
export function localTimeStr(date: Date = new Date()): string {
  const p = localParts(date);
  return `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`;
}

/** Minutos desde medianoche (hora local CDMX) para un instante. */
export function minutesOfDay(date: Date = new Date()): number {
  const p = localParts(date);
  return p.hh * 60 + p.mm;
}

/** Convierte 'HH:MM' a minutos desde medianoche. */
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 'HH:MM' legible: 15:15 -> '3:15 pm'. */
export function prettyTime(hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Nombre del día en español para un weekday 0..6. */
export function weekdayName(w: number): string {
  return ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][w] ?? '';
}

/** Fecha larga en español: 'martes 8 de julio'. */
export function prettyDate(date: Date = new Date()): string {
  const p = localParts(date);
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${weekdayName(p.weekday)} ${p.d} de ${meses[p.m - 1]}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DD' del lunes de la semana actual (hora local CDMX). */
export function weekStartStr(date: Date = new Date()): string {
  const p = localParts(date);
  const offset = p.weekday === 0 ? 6 : p.weekday - 1; // días desde el lunes
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() - offset);
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

/** Lista de fechas 'YYYY-MM-DD' de lunes a viernes de la semana actual. */
export function weekdaysStr(date: Date = new Date()): string[] {
  const monday = weekStartStr(date);
  const [y, m, d] = monday.split('-').map(Number);
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    base.setUTCDate(base.getUTCDate() + i);
    out.push(`${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`);
  }
  return out;
}

/** Medianoche local (CDMX = UTC−6, sin horario de verano) en ISO con offset. */
export function localMidnightISO(dateStr: string): string {
  return `${dateStr}T00:00:00-06:00`;
}

/** Fin de día local en ISO con offset. */
export function localEndOfDayISO(dateStr: string): string {
  return `${dateStr}T23:59:59-06:00`;
}

/** Suma (o resta) días a una fecha 'YYYY-MM-DD' y devuelve 'YYYY-MM-DD'. */
export function addDaysStr(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + delta);
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

/** Lista de fechas 'YYYY-MM-DD' entre dos fechas (inclusive). weekdaysOnly = solo L-V. */
export function datesBetween(desde: string, hasta: string, weekdaysOnly = false): string[] {
  const [y1, m1, d1] = desde.split('-').map(Number);
  const [y2, m2, d2] = hasta.split('-').map(Number);
  const start = Date.UTC(y1, m1 - 1, d1, 12, 0, 0);
  const end = Date.UTC(y2, m2 - 1, d2, 12, 0, 0);
  const out: string[] = [];
  for (let t = start; t <= end; t += 86_400_000) {
    const dt = new Date(t);
    const dow = dt.getUTCDay();
    if (weekdaysOnly && (dow === 0 || dow === 6)) continue;
    out.push(`${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`);
    if (out.length > 200) break; // seguridad
  }
  return out;
}

