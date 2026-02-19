# AGENTS.md

## Objetivo
Este archivo define instrucciones generales para Codex en este proyecto.
Prioriza velocidad de ejecucion, claridad tecnica y cambios seguros.

## Contexto del proyecto
- Stack principal: React + TypeScript + Vite.
- Estilos: Tailwind CSS (con variables de tema ya definidas).
- UI base disponible en `src/components/ui`.
- Router: `react-router-dom`.

## Idioma y comunicacion
- Responder siempre en espanol, salvo que el usuario pida otro idioma.
- Mensajes breves y accionables.
- Explicar que se cambio, en que archivos y por que.

## Forma de trabajo
- Implementar directamente cuando la peticion sea clara.
- Si hay ambiguedad fuerte, hacer 1 pregunta concreta antes de editar.
- No inventar APIs ni endpoints: usar mocks o stubs claros cuando falte backend.
- Reutilizar componentes existentes antes de crear nuevos.
- Mantener consistencia visual con el sistema actual.

## Calidad de codigo
- Mantener TypeScript limpio y legible.
- Evitar complejidad innecesaria.
- No introducir dependencias nuevas sin justificarlo.
- Mantener nombres de variables/componentes claros.
- Evitar comentarios redundantes; comentar solo logica no obvia.

## Validacion
- Despues de cambios relevantes, intentar:
  - `npm run build`
  - `npm run test` (si aplica)
- Si no se puede ejecutar validacion en el entorno, informarlo explicitamente.

## Seguridad de cambios
- No ejecutar comandos destructivos sin peticion explicita.
- No revertir cambios del usuario sin autorizacion.
- Limitar cambios al alcance pedido.

## Criterios UI/UX
- Interfaz limpia, minimalista y atractiva.
- Responsive primero (mobile + desktop).
- Buena jerarquia tipografica y espaciado consistente.
- Estados vacios, carga y error cuando aplique.

## Entrega esperada
- Lista corta con:
  - archivos modificados
  - resumen funcional
  - estado de validacion (build/test)
  - siguiente paso recomendado (solo si aporta valor)
