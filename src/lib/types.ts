// Tipos compartidos entre server y cliente.

export type BlockTipo = 'fija' | 'protegido' | 'dudas' | 'flex' | 'neutral' | 'comida';

export interface DayBlock {
  id: string;
  user_id: string;
  dia_semana: number | null;
  hora_ini: string;
  hora_fin: string;
  label: string;
  tipo: BlockTipo;
  orden: number;
  gcal_event_id: string | null;
}

export type DudaEstado = 'pendiente' | 'incompleta' | 'resuelta' | 'redirigida';

export interface Duda {
  id: string;
  user_id: string;
  slack_ts: string | null;
  slack_channel: string | null;
  autor_id: string | null;
  autor_nombre: string | null;
  contexto: string | null;
  decision: string | null;
  opciones: string | null;
  recomendacion: string | null;
  impacto: string | null;
  urgente: boolean;
  triage_motivo: string | null;
  estado: DudaEstado;
  resolucion: string | null;
  resuelto_por: string | null;
  redirigida_a: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface Prioridad {
  id: string;
  user_id: string;
  tier: 0 | 1 | 2;
  texto: string;
  done: boolean;
  orden: number;
  created_at: string;
  done_at: string | null;
}

export interface BitacoraEntry {
  id: string;
  user_id: string;
  fecha: string;
  hora: string;
  tipo: 'nota' | 'duda_resuelta' | 'prioridad' | 'grabacion' | 'acuerdo' | 'daily';
  texto: string;
  ref_duda_id: string | null;
  ref_grabacion_id: string | null;
  created_at: string;
}

export interface Acuerdo {
  acuerdo: string;
  responsable?: string;
  fecha?: string;
}

export interface Grabacion {
  id: string;
  user_id: string;
  label: string;
  block_ref: string | null;
  persona: string | null;
  fecha: string;
  duracion_seg: number;
  audio_path: string | null;
  transcript: string | null;
  resumen: string | null;
  acuerdos: Acuerdo[];
  estado: 'grabando' | 'subida' | 'transcribiendo' | 'procesando' | 'lista' | 'error';
  created_at: string;
}

export type PersonaTipo = 'interno' | 'cliente' | 'proveedor' | 'otro';

export interface Persona {
  id: string;
  user_id: string;
  nombre: string;
  puesto: string | null;
  correo: string | null;
  slack_user_id: string | null;
  descripcion: string | null;
  tipo: PersonaTipo;
  created_at: string;
}

export interface CooProfile {
  nombre: string | null;
  titulo: string | null;
  objetivo: string | null;
  bio: string | null;
}

export interface Daily {
  id: string;
  user_id: string;
  fecha: string;
  contenido: string;
  enviado_slack: boolean;
  slack_ts: string | null;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string; // ISO
  end: string;   // ISO
  htmlLink?: string;
  status?: string;
}
