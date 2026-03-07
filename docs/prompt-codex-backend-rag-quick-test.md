## Prompt Para Codex (Backend RAG Quick Test)

Usa este prompt tal cual en Codex para que te genere el backend.

```txt
Contexto:
- Proyecto: React + Vite en frontend y Supabase como backend.
- Ya existe en frontend una llamada a `supabase.functions.invoke("generate-quick-test")`.
- El frontend envia este payload JSON:
  {
    "oppositionId": "string",
    "oppositionName": "string",
    "questionCount": number, // 10..100
    "locale": "es" | "en" | string,
    "selectedTopics": [
      { "id": "string", "label": "string" }
    ]
  }
- Ya existe una funcion SQL de RAG en Supabase: `buscar_ley(query_embedding, match_threshold, match_count, filter_id_boe, filter_unit_type)`.
- Tabla existente para historial IA: `ai_conversations` y `ai_messages`.

Objetivo:
Implementar end-to-end el backend para generar tests rapidos por temas con RAG de Supabase y devolver un resultado usable por frontend.

Lo que quiero que implementes:
1) Edge Function `generate-quick-test` (Deno/Supabase Functions):
   - Valida JWT del usuario (obligatorio).
   - No confies en `userId` del body (si llega); usa siempre `auth.uid`.
   - Valida payload:
     - `questionCount` entre 10 y 100.
     - `selectedTopics` no vacio.
     - `oppositionId` requerido.
   - Aplica cuota diaria reutilizando la logica existente (`consume_ai_daily_quota`).
   - Orquesta RAG:
     - Genera embeddings de consulta por cada tema seleccionado.
     - Llama a `buscar_ley` (top-k configurable).
     - Deduplica chunks por id y limita contexto total.
   - Llama al LLM con prompt fuerte para generar preguntas tipo test:
     - 4 opciones por pregunta.
     - 1 sola correcta.
     - explicacion breve.
     - citas legales (id_boe/articulo o referencia equivalente del chunk recuperado).
     - salida JSON estricta.
   - Valida la salida del LLM con esquema (Zod o validacion equivalente).
   - Guarda resultado en DB:
     - crear tablas si no existen (`quick_tests`, `quick_test_questions`, opcional `quick_test_sources`).
   - Responde al frontend con JSON:
     {
       "testId": "uuid",
       "questionCount": number,
       "questions": [ ... ],
       "used": number,
       "limit": number
     }

2) Migraciones SQL:
   - Crear tablas de tests rapidos con RLS por `auth.uid`.
   - Indices para consultas por `user_id` y `created_at`.
   - Si es necesario, crear tabla de plantillas de prompt versionadas (`ai_prompt_templates`) para no hardcodear todo en codigo.

3) Prompt engineering backend:
   - Crear `prompt.ts` con:
     - `systemPrompt` estable (reglas duras: no inventar, responder solo con JSON valido, usar citas, dificultad equilibrada).
     - `buildUserPrompt()` con temas seleccionados, numero de preguntas y locale.
   - Incluir mecanismos anti-hallucination:
     - si no hay contexto suficiente, devolver error controlado o reducir alcance justificadamente.

4) Errores y observabilidad:
   - Errores HTTP consistentes (400 validacion, 401 auth, 429 cuota, 500 interno).
   - Log estructurado minimo (request id, user id, tiempo total, chunks recuperados, modelo usado).
   - No exponer secretos ni stack traces sensibles al cliente.

5) Entregables:
   - Archivos creados/modificados.
   - SQL de migraciones.
   - Contrato final request/response.
   - Ejemplo cURL de prueba.
   - Notas de despliegue (variables de entorno necesarias).

Restricciones:
- Mantener compatibilidad con el frontend actual.
- No romper flujos existentes de AssistantIA.
- Codigo limpio y tipado.
```
