// Plantilla base del día (10:30–21:00) y semillas de prioridades, del spec §3.1 y §3.3.
// Se insertan la primera vez que el COO entra a la app (bootstrap).

import type { BlockTipo } from './types';

export interface BlockSeed {
  hora_ini: string;
  hora_fin: string;
  label: string;
  tipo: BlockTipo;
}

export const DEFAULT_BLOCKS: BlockSeed[] = [
  { hora_ini: '10:30', hora_fin: '10:45', label: 'Revisar plan del día', tipo: 'fija' },
  { hora_ini: '10:45', hora_fin: '11:45', label: 'Reportes — owners juntos', tipo: 'fija' },
  { hora_ini: '11:45', hora_fin: '12:15', label: 'Cotizador T1 Envíos', tipo: 'fija' },
  { hora_ini: '12:15', hora_fin: '12:45', label: 'T1 Merch', tipo: 'fija' },
  { hora_ini: '12:45', hora_fin: '13:00', label: 'Landing t1.com', tipo: 'fija' },
  { hora_ini: '13:00', hora_fin: '13:30', label: 'T1 Global', tipo: 'fija' },
  { hora_ini: '13:30', hora_fin: '14:30', label: 'Flexible', tipo: 'flex' },
  { hora_ini: '14:30', hora_fin: '15:15', label: 'Comida', tipo: 'comida' },
  { hora_ini: '15:15', hora_fin: '16:00', label: 'Ventana de dudas 1', tipo: 'dudas' },
  { hora_ini: '16:00', hora_fin: '18:00', label: 'Definición (protegido)', tipo: 'protegido' },
  { hora_ini: '18:00', hora_fin: '19:00', label: 'Flexible', tipo: 'flex' },
  { hora_ini: '19:00', hora_fin: '19:45', label: 'Ventana de dudas 2', tipo: 'dudas' },
  { hora_ini: '19:45', hora_fin: '20:45', label: 'Flexible 2', tipo: 'flex' },
  { hora_ini: '20:45', hora_fin: '21:00', label: 'Daily', tipo: 'fija' },
];

export interface PrioridadSeed {
  tier: 0 | 1 | 2;
  texto: string;
}

export const DEFAULT_PRIORIDADES: PrioridadSeed[] = [
  { tier: 0, texto: 'Landing t1.com' },
  { tier: 0, texto: 'T1 Global MX' },
  { tier: 0, texto: 'Dashboards aprobados' },
  { tier: 0, texto: 'Benchmark Tiendanube' },
  { tier: 1, texto: 'Cotizador → Abraham' },
  { tier: 1, texto: 'Planes México / Enterprise' },
  { tier: 2, texto: 'T1 Merch' },
];

// Owners a los que se puede redirigir una duda (spec §3.2).
export const OWNERS = ['Charbel', 'Felipe', 'Greg', 'Abraham'];

// Días de la semana para el selector (orden L→D; valor = getDay() 0=dom).
export const WEEKDAYS: { v: number; label: string }[] = [
  { v: 1, label: 'L' },
  { v: 2, label: 'M' },
  { v: 3, label: 'M' },
  { v: 4, label: 'J' },
  { v: 5, label: 'V' },
  { v: 6, label: 'S' },
  { v: 0, label: 'D' },
];

// ¿El bloque aplica en este día de la semana? (dias null/vacío = todos).
export function blockAppliesOn(dias: number[] | null | undefined, weekday: number): boolean {
  return !dias || dias.length === 0 || dias.includes(weekday);
}

// Etiquetas y colores de tipo de bloque (UI).
export const BLOCK_META: Record<BlockTipo, { label: string; color: string; dot: string }> = {
  fija: { label: 'Fija', color: 'bg-ink-800 border-ink-600', dot: 'bg-slate-400' },
  protegido: { label: 'Protegido', color: 'bg-brand-deep/20 border-brand', dot: 'bg-brand-soft' },
  dudas: { label: 'Ventana de dudas', color: 'bg-accent/15 border-accent', dot: 'bg-accent' },
  flex: { label: 'Flexible', color: 'bg-ink-800/60 border-ink-700', dot: 'bg-ink-600' },
  neutral: { label: 'Neutral', color: 'bg-ink-800/40 border-ink-700', dot: 'bg-ink-600' },
  comida: { label: 'Comida', color: 'bg-warn/10 border-warn/40', dot: 'bg-warn' },
};
