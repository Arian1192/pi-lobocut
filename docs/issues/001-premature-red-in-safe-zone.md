# RED prematuro en safe zone: modelo no recupera sentinel oculto tras cambio de tema

## Descripción
Durante una sesión de prueba con **~11k tokens (4% de 272k)**, Lobocut disparó su primer probe y el modelo falló al recuperar el sentinel, provocando un **RED inmediato** y registrando `firstFailureTokens: 11103`. Esto es incorrecto porque ocurrió en **safe zone**, donde un único fallo no debería loggearse como "degradación".

El modelo respondió al probe con:
> "No se proporcionó ningún Session Integrity Code"

Esto indica que **no logró asociar** la instrucción del probe con el `SENTINEL_ID` inyectado en el system prompt.

## Pasos para reproducir
1. Iniciar sesión con Lobocut activado.
2. Generar ~11k tokens de conversación (ej. bloques de texto largos x2/x10).
3. Realizar un **cambio de tema abrupto** (ej. de cuantización a mejillones).
4. Esperar a que el probe dispare (base interval = 10k en safe zone).
5. Observar que el modelo no emite el sentinel `LBC-XXXX-NNNN` y Lobocut marca RED.

## Comportamiento esperado
- En **safe zone**, un único fallo de probe debería ser **YELLOW** o disparar un reintento, no RED directo.
- RED debería reservarse para patrones sostenidos de fallo o para zonas críticas (≥ 90%).
- El probe debería usar la misma nomenclatura que el system prompt para maximizar recuperabilidad.
- Si el probe falla, el texto de error no debería llegar al usuario.

## Comportamiento actual
- `determineHealthState` devuelve `RED` para `probeResult.state === "RED"` **sin importar `tokenPercent`**.
- El probe pide *"Session Integrity Code"* mientras el system prompt declara *"SENTINEL_ID"*.
- `stripSentinelFromText` solo elimina el patrón `LBC-...`, dejando intacto el prefacio *"No se proporcionó..."* (leak UX).

## Análisis de causa raíz
1. **Naming mismatch:** El system prompt inyecta `SENTINEL_ID: LBC-XXXX-NNNN`, pero el probe pregunta por `Session Integrity Code`. El modelo no hizo la asociación.
2. **Semántica de RED demasiado estricta:** `evaluateProbe` devuelve RED cuando no hay candidato. `determineHealthState` propaga este RED inmediatamente, sin ponderar la zona ni permitir reintentos.
3. **Leak UX:** Si el probe falla, la respuesta prefabricada del modelo llega al usuario.

## Fix propuesto (a implementar)
- **A. Alinear nomenclatura:** Cambiar el probe para que referencie explícitamente el `SENTINEL_ID` inyectado, o cambiar la inyección para usar el mismo nombre que el probe.
- **B. Suavizar RED en safe zone:** Que un único miss en safe zone sea `YELLOW` o dispare un reintento inmediato; `RED` solo tras `N` fallos consecutivos o al entrar en caution/critical.
- **C. Sanitizar leak:** Si el probe falla, eliminar toda la respuesta prefabricada del probe (no solo el patrón `LBC-`) antes de mostrarla al usuario.

## Logs de referencia
- Sesión: `2026-05-06T11-35-44-799Z_019dfd12-8d9e-7065-8658-3f0950a3de55`
- Log global: `~/.pi/agent/lobocut-log.jsonl`
- `firstFailureTokens: 11103` en `contextWindow: 272000`
