# Iberica Oposiciones

Plataforma web para preparar oposiciones con IA, tests personalizados, temarios estructurados y sincronización de contenido oficial. El producto combina una experiencia de estudio moderna con una arquitectura preparada para escalar: React en el frontend, Supabase como backend, Edge Functions para procesos críticos y un sistema RAG sobre normativa y temarios.

## Qué vende la plataforma

Iberica Oposiciones está pensada para opositores que necesitan estudiar con foco, practicar con preguntas relevantes y resolver dudas con contexto jurídico actualizado. La aplicación no es solo una landing: incluye un área privada completa con asistente de IA, generación y realización de tests, historial de intentos, temarios por oposición, visor PDF, temporizador Pomodoro, planes de suscripción, soporte y notificaciones.

El valor diferencial está en unir tres piezas:

- **IA aplicada al estudio**: asistente conversacional con historial, cuotas por plan, respuestas en Markdown, mapas conceptuales y recuperación de contexto desde normativa y temarios.
- **Preparación práctica**: tests rápidos por bloques y subtemas, simulacros, temporizador, reanudación de intentos, estadísticas y banco de preguntas con validación.
- **Contenido vivo**: sincronización desde BOE, almacenamiento de temarios, PDFs protegidos, embeddings vectoriales y búsqueda semántica sobre leyes y material de oposición.

## Funcionalidades principales

### Asistente IA

- Chat privado por usuario con conversaciones persistentes.
- Historial paginado, conversaciones fijadas y gestión de mensajes.
- Cuotas diarias configurables desde base de datos según plan.
- Renderizado de respuestas con Markdown y tablas.
- Mapas conceptuales interactivos para resumir relaciones entre ideas.
- Reacciones a mensajes para medir utilidad y mejorar la experiencia.
- Sanitización de entradas y control de tamaño de mensajes.
- Endpoint serverless `ask` con OpenRouter, modelos Qwen y retrieval semántico.

### RAG legislativo y de temarios

- Ingesta de fuentes legales y temarios en `rag_sources`.
- Fragmentación en `rag_chunks`.
- Embeddings de 4096 dimensiones con `qwen/qwen3-embedding-8b`.
- Índices HNSW con `pgvector` para búsqueda aproximada eficiente.
- Funciones SQL `buscar_ley` y `buscar_articulos` optimizadas por similitud.
- Reindexado mediante trabajos en `rag_reindex_jobs`.
- Automatización con `pg_cron` y `pg_net`.
- Sincronización de leyes y temarios desde el BOE mediante Edge Functions.

### Oposiciones y temario

- Catálogo de oposiciones activas en Supabase.
- Estructura por temas, bloques y subtemas.
- Preferencia de oposición por perfil de usuario.
- Temarios versionados con hash para detectar cambios.
- Visor PDF dentro del área privada.
- Descarga de temarios mediante checkout cuando aplica.
- Soporte de traducciones para nombres, cuerpos, temas y subtemas.

### Tests y simulacros

- Tests rápidos configurables por número de preguntas.
- Selección de temas, bloques y subtemas.
- Modo simulacro basado en configuración oficial de examen.
- Banco de preguntas en Supabase con opciones, respuesta correcta, explicación y citas.
- Reutilización de sesiones compatibles para evitar trabajo duplicado.
- Intentos persistentes, pausa, reanudación y control de tiempo restante.
- Historial con nota, precisión, aciertos, duración y estado.
- Reporte de preguntas problemáticas con umbral de desactivación.
- Edge Functions para generar, validar y reclamar tests del banco.

### Área privada de estudio

- Dashboard autenticado.
- Sidebar protegida por sesión y plan.
- Pomodoro con ciclos de foco, descansos cortos y descanso largo.
- Persistencia de estado de estudio mediante provider global.
- Skeletons de carga para pantallas principales.
- Tema claro/oscuro con tokens de diseño.

### Suscripciones, pagos y acceso

- Plan gratuito y plan Pro mensual.
- Estado de plan centralizado en `subscription_plans` y `user_subscriptions`.
- Integración con Stripe Checkout.
- Portal de cliente de Stripe.
- Webhook de Stripe con deduplicación de eventos.
- Códigos de descuento y redenciones.
- Gating de rutas y funcionalidades por plan.
- Política de gracia ante pagos fallidos.

### Soporte y notificaciones

- Sistema de tickets con mensajes, estados y valoración.
- Adjuntos privados en Supabase Storage con URLs firmadas.
- Integración con Telegram para soporte operativo.
- Notificaciones en tiempo real al usuario.
- Emails transaccionales con React Email.
- Preferencias de comunicaciones de producto.

### Autenticación, perfil y privacidad

- Autenticación con Supabase Auth.
- Registro, login, callback, recuperación de contraseña y selección de plan.
- Perfiles con nombre, email, avatar, idioma y borrado lógico.
- Avatares en Supabase Storage con políticas RLS.
- Consentimiento de cookies configurable por categorías.
- Páginas legales: términos, privacidad, sobre nosotros y FAQ.

## Arquitectura técnica

### Frontend

- **React 18** con **TypeScript**.
- **Vite** como bundler y entorno de desarrollo.
- **react-router-dom** para rutas públicas, privadas y protegidas por plan.
- **TanStack Query** para cache, revalidación y estado remoto.
- **Tailwind CSS** con tokens de tema y soporte dark mode.
- Componentes base en `src/components/ui` sobre Radix UI.
- **i18next + react-i18next** con namespaces en `src/locales/es` y `src/locales/en`.
- **lucide-react** para iconografía.
- **React Markdown + remark-gfm** para respuestas enriquecidas del asistente.
- **React PDF / pdfjs-dist** para visualización de documentos.
- **Vitest + Testing Library** para tests.

### Backend y base de datos

El backend está construido sobre Supabase:

- PostgreSQL.
- Supabase Auth.
- Row Level Security en tablas sensibles.
- Supabase Storage para avatares, temarios PDF y adjuntos de soporte.
- Edge Functions en Deno.
- `pgvector` para embeddings.
- `pg_cron` y `pg_net` para automatizaciones.
- Tipos generados en `src/integrations/supabase/types.ts`.

Tablas y dominios principales:

- `profiles`: perfil, idioma, avatar y borrado lógico.
- `ai_conversations`, `ai_messages`, `ai_daily_usage`, `ai_quota_settings`, `ai_message_reactions`.
- `oppositions`, `opposition_syllabi`, `opposition_topics`, `opposition_subtopics`, `opposition_topic_files`.
- `opposition_watchlist`, `law_watchlist`, `boe_sync_log`, `boe_daily_publications`.
- `rag_sources`, `rag_chunks`, `rag_reindex_jobs`, `law_sync_log`.
- `quick_tests`, `quick_test_attempts`.
- `question_bank_tests`, `question_bank_questions`, `question_bank_sources`, `question_bank_claims`, `question_bank_question_reports`.
- `opposition_test_exam_configs`.
- `subscription_plans`, `user_subscriptions`, `discount_codes`, `discount_redemptions`, `stripe_webhook_events`.
- `syllabus_download_purchases`.
- `support_tickets`, `support_ticket_messages`, `support_ticket_attachments`, `support_telegram_threads`, `user_notifications`.
- `faq_votes`.

### Edge Functions

Funciones serverless incluidas en `supabase/functions`:

- `ask`: asistente IA con RAG, historial, cuotas y generación de respuestas.
- `generate-quick-test`: genera tests desde el banco de preguntas.
- `bank_generate_draft`: genera borradores para el banco de preguntas.
- `bank_validate_and_fix`: valida y normaliza preguntas.
- `claim_bank_test_to_quick_test`: transforma tests del banco en sesiones rápidas.
- `sync-laws-rag`: sincroniza normativa y genera chunks/embeddings.
- `process-rag-law-jobs`: procesa trabajos pendientes de reindexado.
- `sync-boe-syllabi`: sincroniza temarios oficiales desde el BOE.
- `scan-boe-daily`: escanea publicaciones diarias del BOE.
- `get-syllabus-pdf`, `get-syllabus-pdf-url`, `download-syllabus-archive`: acceso controlado a temarios.
- `create-checkout-session`, `create-customer-portal-session`, `stripe-webhook`: pagos y suscripciones.
- `create-syllabus-download-checkout`: compra de descarga de temarios.
- `complete-free-signup`, `complete-paid-signup`: cierre de flujos de registro.
- `soft-delete-account`: baja lógica de cuenta.
- `support-telegram`: integración del soporte con Telegram.

## Estructura del proyecto

```txt
src/
  auth/                 Sesión, perfil, locale y logout seguro
  components/           Layouts, navegación, UI base y componentes comunes
  data/                 Resolución de oposiciones desde Supabase + i18n
  emails/               Plantillas React Email
  i18n/                 Configuración de idiomas
  integrations/         Cliente y tipos de Supabase
  lib/                  Utilidades de seguridad, planes, tests y tema
  locales/              Traducciones ES/EN por namespace
  pages/                Rutas públicas y privadas
  queries/              Capa de datos con TanStack Query
  study/                Provider del Pomodoro
  support/              API y formularios de soporte
  test/                 Configuración y tests

supabase/
  functions/            Edge Functions Deno
  migrations/           Evolución del esquema, RLS, cron, storage y SQL
  seeds/                Datos iniciales de watchlists
```

## Requisitos

- Node.js compatible con Vite 5.
- pnpm.
- Proyecto Supabase configurado.
- Variables de entorno para Supabase, OpenRouter, Stripe y servicios opcionales.

Variables habituales en frontend:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Secrets habituales en Supabase Edge Functions:

```bash
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=
OPENROUTER_CHAT_MODEL=
OPENROUTER_REWRITE_MODEL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
CRON_SECRET=
TELEGRAM_BOT_TOKEN=
```

## Desarrollo local

Instalar dependencias:

```bash
pnpm install
```

Arrancar el entorno de desarrollo:

```bash
pnpm dev
```

Compilar producción:

```bash
pnpm build
```

Ejecutar tests:

```bash
pnpm test
```

Validar TypeScript:

```bash
pnpm typecheck
```

Formatear y corregir lint:

```bash
pnpm format:all
```

Previsualizar build:

```bash
pnpm preview
```

## Calidad y seguridad

- TypeScript estricto mediante `tsc -b`.
- ESLint 9 y reglas de hooks de React.
- Prettier con organización de imports.
- Sanitización de inputs en frontend y Edge Functions.
- RLS para datos de usuario, perfiles, mensajes, tickets, notificaciones y compras.
- URLs firmadas para adjuntos privados.
- Control de cuotas para llamadas de IA.
- Deduplicación de webhooks y notificaciones.
- Tests unitarios sobre consentimiento de cookies, queries y lógica de mapas mentales.

## Estado del producto

La base actual ya cubre el flujo completo de una plataforma SaaS de estudio:

1. Captación pública con landing, planes, FAQ y páginas legales.
2. Registro con selección de plan.
3. Área privada protegida por sesión y suscripción.
4. Preparación con IA, temarios, PDF, tests y Pomodoro.
5. Pagos, soporte, notificaciones y emails.
6. Sincronización de contenido oficial y recuperación semántica sobre Supabase.

El resultado es una web vendible y operativa: muestra una propuesta clara al opositor, pero también tiene detrás la infraestructura necesaria para mantener contenido actualizado, controlar acceso por plan y convertir el estudio diario en una experiencia medible.
