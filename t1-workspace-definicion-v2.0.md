# T1 Workspace — Definición de Producto y Plan de Build

**PO / decisiones de producto:** Arturo
**Owner / builder:** Antar
**Fecha:** Julio 2026
**Versión:** 2.0 — reemplaza al doc de seguimiento v1.0 (que asumía a Iñaki como builder)
**Status:** Definido, listo para kickoff Arturo ↔ Antar

---

## 1. Resumen ejecutivo

T1 Workspace es la **memoria organizacional de T1**: captura, estructura y hace consultable todo lo que pasa en la empresa a nivel proyectos — juntas (audio → transcript con speakers identificados), decisiones, acuerdos, action items y documentos (6-pagers, briefs). Cualquier persona graba una junta desde su teléfono, la sube (plataforma o `/voicenote` en Slack), y en minutos el canal del proyecto tiene transcript, resumen, decisiones y compromisos con dueño. Toda la historia de cada proyecto vive en un timeline consultable por AI con citación a la fuente.

**Contexto clave:** Antar ya construyó T1 Focus — el centro de comando personal del COO (agenda, dudas, dailies, copiloto, grabación de juntas). Focus prueba los patrones técnicos centrales, pero es un producto de *un usuario*. Workspace es el producto *organizacional*: proyecto-céntrico, multi-usuario, con permisos. Este doc define ese delta.

**Visión:** interno primero; arquitectura lista para volverse producto externo (multi-tenant-ready a nivel schema sin construir multi-tenancy hoy). Además, Workspace es dogfooding directo del posicionamiento agentic-native/MCP-first de T1.

**Sin fechas en este doc:** el calendario lo define Antar. Este doc fija qué queremos lograr, el scope, y los gates de calidad entre fases.

---

## 2. Qué queremos lograr (definición de éxito)

### North star

Cualquier persona de T1 puede reconstruir la historia completa de un proyecto — qué se decidió, por qué, quién se comprometió a qué — leyendo su timeline, sin preguntarle a nadie. Y la empresa puede preguntarle a su propia memoria y recibir respuestas con fuente citada.

### Resultados medibles (se miden desde beta, sin fecha límite impuesta)

| # | Resultado | Target |
|---|---|---|
| 1 | Juntas de leadership/C-level pasando por Workspace | ≥80% |
| 2 | Accuracy de speaker ID automático (personas con 2-3 juntas acumuladas) | ≥70% |
| 3 | Usuarios activos con ≥1 pregunta al Q&A por semana | ≥50% |
| 4 | Docs nativos activos (6-pagers, briefs, decision records) | ≥30 |
| 5 | Accuracy de transcripción en español mexicano (audios reales T1) | ≥95% — es gate de arranque, no solo métrica |

### Señales cualitativas de éxito

- Onboarding a un proyecto = leer su timeline, no una llamada de 1 hora
- Desaparecen los "¿qué habíamos decidido sobre X?" repetidos en canales
- Los acuerdos de juntas dejan de perderse: cada compromiso tiene dueño, fecha y rastro

---

## 3. Roles

| Rol | Persona | Responsabilidad |
|---|---|---|
| PO / decisiones de producto | Arturo | Aprueba scope, cambios de alcance y gates; demos con Antar a la cadencia que acuerden |
| Owner / builder | Antar | Arquitectura final, build, propone calendario y fases; valida las recomendaciones técnicas de este doc |
| Integración gemelo digital (fase 2) | Iñaki | Conectar transcripts de Workspace al gemelo/BDD de empleados que ya construyó |
| Organigrama completo | Fernanda | Excel de ~130 personas con estructura de reporte (base: las 49 de Focus) |
| Design system | Karla | La UI de Workspace aplica el design system T1 |

**Regla de decisión:** Antar propone, Arturo decide en scope/producto. Decisiones técnicas que no afectan scope/UX las toma Antar directo.

---

## 4. Relación con T1 Focus (importante — leer antes de arrancar)

### Qué es cada cosa

- **Focus** = centro de comando *personal* del COO. Un usuario, RLS por user_id. Su agenda, sus dudas, sus prioridades, su daily, su copiloto.
- **Workspace** = memoria *organizacional*. ~130 usuarios, proyecto-céntrico, permisos multi-usuario, historia consultable de la empresa.

Overlap real: ~25% (pipeline grabar → transcribir → resumir, plumbing de Slack, directorio de personas). El corazón de Workspace — proyectos con timeline, speaker ID con fingerprint, permisos, docs nativos, Q&A con citación, búsqueda semántica, MCP — no existe en Focus. Y el modelo de datos es opuesto: Focus es user-céntrico, Workspace es proyecto-céntrico.

### Qué se reusa de Focus (probado en producción)

| Pieza | Estado |
|---|---|
| UX de grabación: Wake Lock, barra flotante, PWA mobile-first, auto-ligado a personas | Portar |
| Plumbing de Slack: comandos, eventos, OAuth, interactividad | Portar |
| Patrón del copiloto: tool use de Claude + acciones de lectura directas + acciones con efecto como propuesta que el usuario confirma | Portar al bot de Workspace |
| Diseño de prompts: `summarizeMeeting` (resumen + acuerdos), triage, salidas JSON estructuradas | Portar y extender |
| Espejo local de Google Calendar (sync incremental + realtime) | Portar cuando toque calendario |
| Disciplina de handoff/documentación | Mantener como estándar del proyecto |

### Qué cambia de raíz

- Modelo de datos: de user-céntrico a proyecto-céntrico multi-usuario con permisos
- Transcripción: Deepgram → **Eleven Labs Scribe v2** (la razón: accuracy en español, 98% en benchmarks; es un swap de 1 módulo en el pipeline)
- Speaker ID: Focus no identifica quién habla; Workspace sí (diarización + sugerencia por contexto + fingerprint acumulativo)
- Alcance: de "mi día" a "la memoria de la empresa"

### Destino de Focus (recomendación, valida Antar)

Focus **sigue vivo** como la capa personal de Antar. En fase 2, cuando Workspace generalice la capa personal (ver sección 5), Focus se convierte en cliente de Workspace vía MCP o sus features se absorben como la "vista personal" de Workspace. No se deprecia nada hoy.

---

## 5. Mapa del ecosistema interno (qué se junta con qué)

Principio rector: **Workspace no duplica ningún sistema de personas — se conecta a ellos.** Workspace es el único sistema de memoria de *organización*.

| Sistema | Qué es | Estado | Relación con Workspace |
|---|---|---|---|
| **T3T + Dailies** | Ciclo de ejecución de personas: prioridades quincenales + reporte diario | Existe | Workspace NO lo reemplaza ni duplica. Fase 2: resúmenes de juntas enriquecen los dailies (como Focus ya hace para Antar); action items de juntas se contrastan con prioridades T3T |
| **Gemelo digital / BDD empleados** | Memoria de cada persona (17 categorías), alimentado por Dailies + T3T | Existe (Iñaki) | Separados en v1. Fase 2: transcripts de Workspace alimentan al gemelo (Iñaki conecta) |
| **Pulse T1** | Ritmo semanal de KPIs (ClickHouse) | Existe | Los Pulse weeklies se capturan en Workspace como junta recurrente desde beta. Fase 2: el Q&A jala KPIs de ClickHouse vía MCP (Workspace como MCP client) |
| **Focus** | Capa personal del COO | Existe (Antar) | Ver sección 4 |
| **Glean** | Búsqueda cross-fuente empresarial | En adopción | Consume Workspace vía MCP como una fuente más. Workspace NO depende de Glean: tiene Q&A y búsqueda propios (clientes externos futuros quizá no tengan Glean) |
| **Cortex (Franco)** | Plataforma central MCP/CI-CD | Existe | El MCP server de Workspace vive **aparte de Cortex por ahora** (decidido). Revisar integración cuando madure |

**Capa personal (dudas generalizadas, briefs por líder, copiloto por usuario): fase 2.** V1 es solo memoria organizacional. Generalizar el CEO Brief hoy duplicaría los Dailies existentes; lo correcto es integrarse a ellos, no competirles.

---

## 6. Log de decisiones (vigente)

Cerradas — no reabrir salvo información nueva relevante:

| # | Decisión | Rationale |
|---|---|---|
| 1 | **Nombre: T1 Workspace** | Bilingüe idéntico, categoría reconocida, cubre meetings + docs + proyectos + AI, vendible externamente |
| 2 | **Build custom, no comprar** | Fathom/Fireflies/Granola/Otter/etc. asumen bot en Zoom/Meet; ninguno cubre junta presencial → teléfono → upload → speaker ID en español; ninguno usa Eleven Labs |
| 3 | **Transcripción: Eleven Labs Scribe v2** | Mejor accuracy en español del mercado (98%); diarización 32-48 speakers; keyterm prompting 1000 términos; $0.40/hr |
| 4 | **V1 batch post-junta, NO realtime** | Realtime agrega complejidad de streaming sin necesidad validada. Fase 2 |
| 5 | **V1 upload de archivo, NO bot en Zoom/Meet/Teams** | El caso primario T1 es junta presencial grabada en teléfono. Fase 2 si la adopción lo amerita |
| 6 | **Speaker ID híbrido: AI sugiere → humano confirma → fingerprint acumulativo** | Cero enrollment. Sugerencia por contexto (organigrama + asistentes + tipo de junta). Cada confirmación graba embedding de voz. Override manual siempre |
| 7 | **Aceptar paste de transcripts existentes** | Juntas de Meet/Zoom/Teams con transcript se pegan directo; AI parsea. Amplía casos de uso (entrevistas, llamadas, notas) |
| 8 | **1 proyecto = 1 canal Slack (default) + linked projects** | El primitivo es "proyecto"; el canal lo conecta |
| 9 | **Permisos: miembros del canal ven todo; juntas "privadas" solo asistentes; CEO/admin ve todo** | Memoria de proyecto exige que quien se une a mitad de camino pueda leer la historia. Sensibles (board, M&A, performance, HR) se marcan privadas al subir |
| 10 | **Nada se borra nunca** | Archivar = salir de navegación activa, queda searchable. Borrar es excepción de admin |
| 11 | **Docs nativos en la plataforma + sync con Google Docs** | Home canónico de 6-pagers/briefs/decision records. Import por link con mirror one-way opcional, export on-demand |
| 12 | **Multi-tenant-ready sin construir multi-tenancy** | `org_id` en todo el modelo de datos y storage desde día 1. Overhead mínimo hoy, evita migración brutal si se vende externo |
| 13 | **Q&A y búsqueda nativos (no depender de Glean)** | Clientes externos futuros quizá no tengan Glean. Glean consume vía MCP como un cliente más |
| 14 | **MCP server estándar como capa de integración** | Un solo server sirve a Glean, Claude Desktop, Cursor, ChatGPT, copilots. Sin lock-in |
| 15 | **Stack sigue al builder** *(enmienda a la v1.0)* | Recomendación: quedarse con el stack probado de Antar — Supabase/Postgres + Next.js — en lugar de migrar a Mongo/Lambdas/Bedrock. Postgres RLS implementa "permisos en capa de datos" de forma nativa; pgvector cubre búsqueda semántica; el momentum y deploy ya existen. **Innegociables independientes del stack:** `org_id` en todo, permisos enforced en capa de datos, nada se borra, MCP server, Scribe v2. *Pendiente validación de Antar* |
| 16 | **Brief + demos en lugar de 6-pager** | Herramienta interna; este doc es la referencia |
| 17 | **Builder: Antar** | Ya tenía avance propio (Focus) y la idea fue de ambos. Iñaki queda para la integración con el gemelo en fase 2 |
| 18 | **Repo en la org GitHub de T1 desde día 1** | Workspace es IP de T1 y potencial producto vendible. Focus puede quedarse donde está |
| 19 | **Gemelo digital separado; integración en fase 2** | Sistemas con dueños distintos; conectar cuando Workspace tenga volumen real de transcripts |
| 20 | **MCP server aparte de Cortex por ahora** | Revisar cuando madure |
| 21 | **Sin fechas impuestas: el calendario lo define Antar** | Este doc fija outcomes, scope y gates de calidad. Antar propone fases y tiempos |
| 22 | **Workspace no duplica sistemas de personas** | Dailies, T3T, gemelo y Pulse ya existen. Workspace se conecta a ellos (fase 2), no les compite |
| 23 | **Capa personal = fase 2** | Dudas generalizadas, briefs por líder y copiloto por usuario llegan después, integrados a Dailies/T3T/gemelo. Focus cubre la capa personal del COO mientras tanto |
| 24 | **La UI aplica el design system de Karla** | Cero UI inventada fuera del sistema |
| 25 | **Pulse weekly se captura desde beta** | Es el tipo de junta recurrente perfecto para probar templates comparativos semana vs semana |
| 26 | **El bot reusa el patrón del copiloto de Focus** | Tool use + lecturas directas + acciones con efecto como propuesta confirmable. Ya probado en producción |

**Recomendaciones pendientes de validar con Antar:** stack (#15), repo nuevo portando componentes vs evolucionar el repo de Focus, destino de Focus (sección 4).

---

## 7. Scope funcional completo v1

Referencia contra la cual se valida el build. Cambios de scope pasan por Arturo y se registran en el log.

### 7.1 Captura de información

- Upload de audio desde web (drag-drop o file picker)
- Upload de audio desde móvil vía PWA (iPhone y Android)
- Slash command `/voicenote` en Slack con audio adjunto
- Paste de transcript existente (Google Meet, Zoom, Teams) con parser de formato "Speaker: texto"
- Paste de texto/notas sueltas para formalizar en memoria de proyecto
- Upload bulk (varios audios a la vez)
- Import de Google Docs por link
- Setup inicial de organigrama vía Excel template

### 7.2 Transcripción y speaker ID

- Transcripción automática con Eleven Labs Scribe v2 (batch)
- Diarización hasta 32-48 speakers
- AI sugiere identidad de cada speaker por contexto: organigrama + asistentes + tipo de junta + rol
- Humano confirma sugerencias (una vez por persona por junta)
- Voice fingerprint acumulativo: cada confirmación graba embedding de voz (nunca audio crudo)
- Auto-identificación después de 2-3 juntas por persona
- Override manual siempre: vista de transcript con waveform sincronizado + timeline, click en segmento para reasignar
- Edición manual de palabras mal transcritas
- Keyterm prompting con nombres de gente T1, productos y jerga interna — editable desde admin
- Búsqueda dentro del transcript de una junta

### 7.3 Estructura de proyectos

- Crear proyecto (manual o auto-creado desde canal de Slack)
- Default: 1 proyecto = 1 canal Slack; linked projects para iniciativas cross-área
- Tipos de junta con template de resumen y defaults de permisos:
  - **Recurrente operativa** (Pulse weekly, 1:1s, weeklies): template comparativo vs sesión anterior; permiso = miembros del canal
  - **Proyecto-específica** (kickoff, review, milestone): alimenta timeline; permiso = miembros del canal
  - **Estratégica/sensible** (board, M&A, performance, HR): privada, solo asistentes, no se postea al canal
  - **One-off/externa** (negociación, partner, cliente, entrevista): default asistentes, link opcional a proyecto
- AI sugiere el tipo de junta; usuario confirma
- Timeline cronológico por proyecto: juntas, docs, decisiones, action items, archivos
- Series de juntas recurrentes auto-vinculadas
- Estados: activo, en pausa, archivado (archivado = fuera de navegación, searchable)
- Owner por proyecto, tags custom
- Dashboard por proyecto: juntas recientes, action items abiertos, docs

### 7.4 AI / Inteligencia

- Resumen automático post-junta (template según tipo)
- Extracción de action items con dueño + fecha
- Extracción de decisiones tomadas
- Extracción de preguntas abiertas
- Q&A sobre memoria de proyecto vía UI y vía bot de Slack per canal
- Respuestas con citación al minuto exacto de la junta fuente — obligatorio, sin cita no hay respuesta
- Búsqueda semántica cross-proyecto (respetando permisos) + full-text
- Sugerencia automática de tipo de junta
- Detección de temas recurrentes/duplicados
- Resúmenes cross-proyecto bajo demanda ("dame el estado de Peru")

### 7.5 Action items y seguimiento

- Extracción automática post-junta
- Asignación vía @mention, fecha límite, estados (abierto / en progreso / completado)
- Notificación al asignado vía Slack DM + email (usuarios sin Slack)
- Edición manual + adición manual de items no detectados
- Vista personal "mis action items abiertos" y vista por proyecto
- Recordatorios al acercarse o vencer la fecha

### 7.6 Docs nativos

- Editor tipo Notion (librería la decide Antar)
- Templates: 6-pager, brief, decision record, plan
- Versionado automático, comentarios y menciones, colaboración en tiempo real
- Import desde Google Docs por link (mirror one-way opcional); export on-demand
- Docs viven dentro de un proyecto
- AI genera borrador de doc a partir de los transcripts del proyecto

### 7.7 Integración Slack

- Bot per canal con Q&A sobre la memoria de ese proyecto — reusa el patrón del copiloto de Focus (tool use + confirmación para acciones con efecto)
- `/voicenote` para subir audio; `/preguntar` para Q&A directo
- Auto-post de resumen + action items al canal al terminar la transcripción, con @mentions
- Mapeo automático canal ↔ proyecto
- **La plataforma funciona 100% standalone sin Slack** — usuarios sin Slack operan por UI web + email

### 7.8 Permisos y seguridad

- Default: miembros del canal ven todo el proyecto; privadas solo asistentes; CEO/admin ve todo
- Roles: admin, owner de proyecto, miembro, viewer
- Permisos enforced en capa de datos (con el stack recomendado: Postgres RLS nativo)
- Audit log de accesos
- Borrado restringido a admin
- Encriptación en tránsito y reposo
- SSO con Google

### 7.9 Organigrama

- Setup inicial vía Excel template (~130 personas; base: las 49 de Focus)
- Editable en plataforma
- Source of truth para sugerir speakers, contexto de rol y permisos
- Estructura: persona → rol → área → reporta a; foto opcional
- Embeddings de voz acumulados por persona

### 7.10 MCP server e integraciones

- MCP server custom vía OAuth, respetando permisos del usuario que consulta
- Clientes: Glean, Claude Desktop, Cursor, ChatGPT, copilots empresariales
- API REST + webhooks (junta procesada, action item creado, decisión registrada)

### 7.11 UI / UX

- Web app responsive, PWA-capable
- Aplica el design system de T1 (Karla)
- Vistas: timeline por proyecto, lista de proyectos, transcript con audio sincronizado, búsqueda global, vista personal (mis action items, mis juntas, mis proyectos)
- Notificaciones in-app + onboarding tour

### 7.12 Admin

- Console: usuarios, roles, proyectos
- Métricas de uso: juntas procesadas, accuracy de speaker ID, volumen de Q&A
- Cuotas configurables, edición de keyterms, audit log, backup automático

---

## 8. Fuera de scope v1 (fase 2+)

Registrado para que nadie lo pida a medio build:

- **Capa personal generalizada:** dudas con triage para cualquier líder, briefs diarios por persona (integrados a los Dailies existentes, no duplicados), copiloto personal por usuario
- **Integración con el gemelo digital:** transcripts de Workspace alimentan la BDD de empleados (Iñaki)
- **Integración T3T:** contraste de action items de juntas vs prioridades quincenales
- **Workspace como MCP client:** Q&A jalando KPIs de ClickHouse (Pulse) y otras fuentes
- Bot que se une automáticamente a Zoom/Meet/Teams
- Transcripción realtime
- Auto-update de estado de proyecto por AI (riesgo de alucinación)
- Sugerencias proactivas de próximos pasos
- Análisis cross-proyecto de patrones
- Multi-tenancy completa: billing, admin multi-org, white-label, custom domains
- App móvil nativa

---

## 9. Arquitectura técnica

### Stack recomendado (valida Antar — enmienda #15 del log)

| Capa | Recomendación | Nota |
|---|---|---|
| Framework | Next.js (App Router) — front + API routes | Ya probado en Focus |
| UI | Tailwind, mobile-first, PWA | + design system de Karla |
| DB / auth / storage / realtime | Supabase (Postgres + RLS, Google OAuth, Storage, Realtime) | RLS = permisos en capa de datos, nativo |
| Búsqueda semántica | pgvector sobre el mismo Postgres | Embeddings de transcripts y docs |
| IA | Claude (Anthropic SDK o Bedrock — decide Antar) | Resumen, extracción, Q&A, bot |
| Transcripción | **Eleven Labs Scribe v2** (swap desde Deepgram) | Único cambio innegociable vs Focus |
| Slack | Web API + Events + slash commands | Plumbing portado de Focus |
| Jobs | Inline con `after()` donde aplique + cron | Patrón ya validado en Focus |
| Hosting | Antar decide (Railway hoy; evaluar AWS si conviene) | — |
| Integraciones | MCP server custom (OAuth) + REST + webhooks | Aparte de Cortex por ahora |

### Innegociables independientes del stack

- `org_id` en todo el modelo de datos y storage desde día 1
- Permisos enforced en capa de datos, no en aplicación
- Nada se borra; archivar ≠ borrar
- Voice fingerprints como embeddings, nunca audio crudo suelto
- Toda respuesta del Q&A cita junta + minuto fuente
- MCP server como interfaz de integración estándar
- Repo en la org GitHub de T1

### Costos operativos estimados

| Rubro | Estimado mensual |
|---|---|
| Eleven Labs Scribe v2 ($0.40/hr, ~500 hrs/mes) | ~$200 USD |
| Claude (resumen + Q&A) | Variable; medir en beta |
| Supabase + hosting + storage | $200–1,000 USD |
| **Total v1** | **<$5K USD/mes** |

---

## 10. Fases y gates de calidad (sin fechas — calendario lo propone Antar)

El orden importa; las fechas no están impuestas. Cada gate lo valida Arturo en demo antes de pasar a la siguiente fase.

### Fase 0 — Arranque
Repo en org T1, infra montada, cuenta Eleven Labs activa, diseño del modelo de datos proyecto-céntrico revisado.
**Gate G0:** Scribe v2 probado con 3-5 audios reales de juntas T1 (presenciales, con ruido real) ≥95% accuracy. **Si no pasa, se replantea antes de construir encima.** Modelo de datos revisado por Arturo.

### Fase 1 — Captura y transcripción
Upload (web + PWA + `/voicenote`), pipeline Scribe v2, vista de transcript con waveform, corrección de speakers, keyterms cargados, paste de transcripts externos.
**Gate G1:** 5 juntas reales end-to-end; corrección de speakers usable desde el teléfono; paste de un transcript de Meet funcionando.

### Fase 2 — Inteligencia y proyectos
Resúmenes, action items, decisiones; proyectos con timeline, tipos de junta y permisos; fingerprint activo; embeddings + búsqueda.
**Gate G2:** resúmenes y action items validados como útiles por 3+ líderes en juntas reales; junta privada invisible para no-asistentes (probado); fingerprint identificando correctamente a personas con 3+ juntas.

### Fase 3 — Slack, Q&A, docs y MCP
Bot per canal, slash commands, auto-post con @mentions, editor de docs, import/export Google Docs, MCP server probado con Claude Desktop y Glean, admin v1.
**Gate G3 (go/no-go de beta):** flujo completo demo-able — grabar junta en teléfono → `/voicenote` → resumen en el canal → Q&A responde con cita correcta al minuto.

### Beta cerrada — leadership
8-10 usuarios (Arturo, Antar, Franco, Iñaki, Fernanda + líderes). Toda junta de leadership pasa por Workspace. Pulse weekly capturado. Feedback semanal → fixes.
**Gate G4:** métricas de la sección 2 en trayectoria; sin bugs críticos; onboarding listo.

### Rollout a todo T1
Anuncio en #all-t1 + onboarding. Organigrama completo cargado. Canales de proyecto mapeados.

---

## 11. Riesgos y mitigaciones

| # | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| 1 | Adopción baja: la gente no sube sus juntas | Media | Alto | `/voicenote` = fricción mínima; leadership predica con el ejemplo en beta; el Q&A demuestra el valor en juntas reales |
| 2 | Expectativa de que "Focus ya lo es" y se subestime el delta | Media | Alto | Sección 4 de este doc; el delta es ~75% del scope y el modelo de datos cambia de raíz |
| 3 | Accuracy de Scribe v2 con audio real T1 menor al benchmark | Baja | Alto | Gate G0 con audios reales ANTES de construir encima; keyterms con jerga T1 |
| 4 | Speaker ID decepciona en juntas grandes o audio malo | Media | Medio | Override manual siempre; expectativa "sugiere, tú confirmas"; guía de grabación (teléfono al centro) |
| 5 | Juntas sensibles no se suben por desconfianza | Media | Medio | Tipo privado desde v1, comunicado explícito en onboarding |
| 6 | Scope creep | Alta | Medio | Este doc es la referencia; fase 2 estaciona ideas; cambios pasan por Arturo |
| 7 | AI alucina en resúmenes o Q&A | Media | Alto | Citación obligatoria; resúmenes editables; sin auto-updates de estado en v1 |
| 8 | Bus factor: todo el build en Antar | Media | Alto | Disciplina de handoff ya demostrada; repo en org T1; documentación desde fase 0 |

---

## 12. Checklist de arranque (dependencias no-código)

- [ ] Crear repo en la org GitHub de T1 + accesos
- [ ] Cuenta Eleven Labs con cuota validada (~500 hrs/mes) + API key
- [ ] Slack App de Workspace (recomendación: app nueva, separada de la de Focus — valida Antar)
- [ ] Organigrama completo ~130 personas con estructura de reporte (Fernanda; base: 49 de Focus)
- [ ] Lista inicial de keyterms: nombres completos del equipo, productos, jerga
- [ ] Tokens del design system con Karla
- [ ] Definir los 8-10 usuarios de beta
- [ ] Acordar cadencia de demos Arturo ↔ Antar

---

## 13. Preguntas abiertas (kickoff Arturo ↔ Antar)

1. Validación del stack recomendado (quedarse en Supabase/Next + swap a Scribe v2) o contrapropuesta de Antar
2. Repo nuevo portando componentes de Focus vs evolucionar el repo de Focus (recomendación: repo nuevo — el modelo de datos cambia de raíz)
3. Slack App nueva vs extender la de Focus
4. Claude vía Anthropic SDK directo vs Bedrock
5. Estrategia de embeddings: modelo, chunking, refresh
6. Hosting: quedarse en Railway vs mover a AWS
7. Propuesta de calendario por fases (Antar)

---

## 14. Referencia rápida

- **Nombre:** T1 Workspace
- **PO:** Arturo | **Owner/Builder:** Antar | **Fase 2 gemelo:** Iñaki
- **Qué es:** la memoria organizacional de T1 — juntas, decisiones, acuerdos, docs, consultable con AI
- **Qué NO es:** un segundo sistema de dailies, ni T3T, ni el gemelo, ni Pulse — se conecta a ellos
- **Stack (rec):** Supabase/Postgres + Next.js + Scribe v2 + Claude + MCP
- **Principio rector:** captura sin fricción, memoria que no se borra, AI que cita sus fuentes

---

*v2.0 — reemplaza la v1.0. Cambios de scope requieren aprobación de Arturo y se registran en el log de decisiones (sección 6).*
