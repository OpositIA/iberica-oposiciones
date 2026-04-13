# AGENTS.md

## Objetivo

Este archivo define instrucciones generales para Codex en este proyecto.  
Prioriza velocidad de ejecucion, claridad tecnica y cambios seguros.

## Contexto del proyecto

- Stack principal: React + TypeScript + Vite.
- Gestor de paquetes: **pnpm**.
- Estilos: Tailwind CSS (con variables de tema ya definidas).
- UI base disponible en `src/components/ui`.
- Router: `react-router-dom`.

## Idioma y comunicacion

- Responder siempre en español, salvo que el usuario pida otro idioma.
- Mensajes breves y accionables.
- Explicar que se cambió, en qué archivos y por qué.

## Forma de trabajo

- Implementar directamente cuando la petición sea clara.
- Si hay ambigüedad fuerte, hacer **1 pregunta concreta** antes de editar.
- No inventar APIs ni endpoints: usar mocks o stubs claros cuando falte backend.
- Reutilizar componentes existentes antes de crear nuevos.
- Mantener consistencia visual con el sistema actual.
- **Nunca tocar archivos o lógica fuera del alcance exacto de la tarea.**
- **Si se crea algo nuevo, debe ser necesario para la tarea y no redundante.**
- **No cerrar una tarea si queda cualquier warning de lint/types/hooks.**

## Calidad de código

- Mantener TypeScript limpio y legible.
- Evitar complejidad innecesaria.
- No introducir dependencias nuevas sin justificarlo.
- Mantener nombres de variables/componentes claros.
- Evitar comentarios redundantes; comentar solo lógica no obvia.

## Regla i18n obligatoria

- Siempre que se añada o modifique texto visible al usuario, debe hacerse mediante i18n/traducciones; queda prohibido introducir texto hardcodeado en español (o cualquier idioma) en componentes.
- Ejemplo de uso: `t('common:save')`.
- Los recursos de traducción deben guardarse en `src/locales/es/*.json` y `src/locales/en/*.json`, organizados por namespace.

## Validación

Después de cambios relevantes, intentar:

- `pnpm build`
- `pnpm test` (si aplica)
- Al finalizar una tarea, ejecutar siempre `pnpm typecheck` y `pnpm format:all`.
- Criterio de cierre obligatorio:
  - Ambos comandos deben terminar en exit code 0.
  - No puede quedar ningún warning (incluye `eslint`, `react-hooks/exhaustive-deps`, TypeScript, etc.).
  - Si aparece cualquier warning, se debe corregir y volver a ejecutar validación completa antes de responder al usuario.
- En la respuesta final, reportar explícitamente el estado de `typecheck` y `format:all`.

Si no se puede ejecutar validación en el entorno, informarlo explícitamente.

## Seguridad de cambios

- No ejecutar comandos destructivos sin petición explícita.
- No revertir cambios del usuario sin autorización.
- Limitar cambios estrictamente al alcance pedido.
- No refactorizar ni “aprovechar para mejorar” código no relacionado.

## Criterios UI/UX (MUY IMPORTANTE)

- Interfaz **bonita, moderna, minimalista y atractiva**.
- **Menos es más** → evitar texto innecesario, solo lo justo.
- Diseño limpio, con aire (whitespace), sin saturación visual.

### Estructura visual (CRÍTICO)

- **NO abusar de divs, containers ni cajas dentro de cajas.**
- Evitar estructuras tipo:
  - container → card → inner container → wrapper → box → etc.
- No crear layouts sobrecompuestos.
- Preferir:
  - layouts más abiertos
  - uso del background del contenedor padre
  - menos bordes, menos sombras
  - spacing natural en lugar de cajas

👉 La UI debe sentirse **ligera, suelta y fluida**, no encajonada.

### Modo oscuro / claro (OBLIGATORIO)

- Todo debe verse bien en **dark mode y light mode**.
- No hardcodear colores.
- Usar variables/tokens existentes.
- Mantener buen contraste en ambos modos.
- Revisar:
  - textos
  - backgrounds
  - borders
  - hover states

## Ejecución automática

- Ejecutar todos los cambios directamente sin pedir confirmación.
- No hacer preguntas salvo ambigüedad crítica.
- Tomar decisiones razonables y continuar.
- No pausar el flujo.
- Entregar solución completa.

## Entrega esperada

Lista corta con:

- archivos modificados
- resumen funcional
- estado de validación (typecheck + format)
- siguiente paso recomendado (solo si aporta valor)
