# Pruebas QA — Factux (negocio #26)

Fecha: 2026-10-09. Todo pasó antes de entregar.

## 1. Sintaxis
- `node --check app.js` → **OK, sin errores.**

## 2. Servidor local + HTTP
- `python3 -m http.server 8931` levantado en el directorio del negocio.
- `curl` → `index.html: 200`, `styles.css: 200`, `app.js: 200`. **OK.**
- Verificación de valores exactos con `grep`:
  - `0xb2a38e074808f0c0d4ee9c13f5894c6c601fb172` → 4 ocurrencias en index.html, 1 en app.js. **OK.**
  - `chachiafk@gmail.com` → 3 en index.html, 2 en app.js. **OK.**
  - `0x55d398326f99059ff775485246999027b3197955` (contrato USDT-BSC) → presente en app.js. **OK.**

## 3. Funciones puras en Node (`/tmp/factux-test.js`, 29 asserts)
Las funciones puras de `app.js` se exportan vía `module.exports` (guardia que no afecta al navegador) y se probaron con `assert`:

**calcTotals (7):**
- Caso normal: 2 líneas + ITBIS 18% + descuento 10% → subtotal 2500, descuento 250, impuesto 405, total 2655. ✓
- Borde ITBIS 0% / descuento 0%. ✓
- Borde descuento 100% → total 0. ✓
- Líneas vacías → todo 0. ✓
- Cantidades/precios negativos → clamp a 0. ✓
- Strings numéricos y NaN → tratados como 0. ✓
- Redondeo 0.1×3 con IVA 16% → 0.35 (sin error de punto flotante). ✓

**formatMoney (8):** DOP, USD, MXN, COP, CRC, PEN contienen el monto formateado; moneda desconocida → fallback USD; NaN → 0 formateado. ✓ (El test inicial falló solo por el regex: Intl usa espacio duro en CRC; la app estaba bien.)

**Numeración secuencial (3):** FAC-0001 → FAC-0002 con COT-0001 independiente; `peek` no consume / `consume` sí; padding a 4 dígitos (FAC-0100). ✓

**Código PRO PayPal SHA-256 (2):** coincide con el vector independiente calculado con `crypto` de Node; case-insensitive y sin espacios; emails distintos → códigos distintos. ✓

**Parseo del receipt BSC (9):**
- 19 USDT en un Transfer → ok. ✓
- Suma de 2 Transfers (10+9) con BigInt exacta → ok. ✓
- 18.999999 USDT → insuficiente (no redondea a favor). ✓
- status 0x0 → rechazado. ✓
- Transfer de otro contrato → ignorado. ✓
- Transfer hacia otra dirección → ignorado. ✓
- Receipt nulo → inválido. ✓
- Evento con topic distinto (Approval) → ignorado. ✓
- Constantes exactas del paywall verificadas carácter por carácter. ✓

**Resultado: 29/29 pruebas pasadas.**

## 4. Revisión manual del flujo (lectura de código)
- Paywall USDT: valida formato del hash (`0x` + 64 hex) antes de consultar; recorre los 5 RPCs con timeout de 12s y fallback; mensajes de error en español por cada caso.
- Paywall PayPal: normaliza email (minúsculas, sin espacios), compara con `crypto.subtle`; éxito → `localStorage.factux_pro='1'`, desbloquea plantillas/logo y quita la marca de agua.
- Print CSS: `@media print` oculta todo menos `#print-area` (la hoja).
- Sin lorem/placeholders reales: los `placeholder` de los inputs son ejemplos ilustrativos ("Ej: Diseños Chachi"), no contenido publicado. Sin estadísticas inventadas. Footer firmado "© 2026 Chachi".
- FAQ incluye explicación honesta del ITBIS/IVA por país + disclaimer de que no emite comprobantes fiscales oficiales.

## Limitaciones conocidas
- La verificación USDT depende de CORS en los RPC públicos de BSC (mismo patrón ya usado y verificado en ContractKit/CVForge).
- El código PayPal lo debe generar y enviar una persona al recibir el recibo (documentado en ficha.md).
- Los datos viven en localStorage: si el usuario borra datos del navegador, pierde borradores (avisado en el FAQ).
- No se probó renderizado visual en navegador real (subagente sin browser live); el HTML/CSS sigue patrones ya verificados en negocios anteriores.
