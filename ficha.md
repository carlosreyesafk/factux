# Ficha del negocio #26 — Factux

## Negocio
**Factux** — Generador de facturas y cotizaciones profesionales para freelancers y micro-negocios de Latinoamérica, 100% en español. Sitio estático de una página (landing + herramienta funcional), sin backend ni API keys: todo corre en el navegador del usuario (localStorage).

## Precio
- **Gratis:** generador completo, 1 plantilla, con marca "Generado con Factux".
- **PRO — US$19 pago único:** logo propio (URL), 5 plantillas de diseño premium, sin marca. Acceso de por vida, sin suscripción.

## Comprador
Freelancers y micro-negocios de LATAM (RD, México, Colombia, Perú, Costa Rica) que hoy facturan en Excel o Word y quieren verse profesionales sin pagar un software contable. Se diferencian por idioma (español), ITBIS/IVA configurable, RNC/NIT/RFC opcional y monedas locales (DOP, USD, MXN, COP, CRC, PEN).

## Entregable
`index.html` + `styles.css` + `app.js` (deploy a GitHub Pages por el agente principal). Funciones: modo Factura/Cotización, numeración secuencial automática (FAC-0001… / COT-0001…, editable), líneas dinámicas, toggle de impuesto con % editable (18% por defecto), descuento %, estados (borrador/emitida/pagada), preview en vivo, exportar/imprimir a PDF con CSS de print, persistencia en localStorage.

## Vía de cobro
1. **USDT — red BSC (BEP-20):** 19 USDT a `0xb2a38e074808f0c0d4ee9c13f5894c6c601fb172`. El comprador pega el hash de la transacción y el JS verifica contra RPCs públicos de BSC (`eth_getTransactionReceipt`): exige `receipt.status == 0x1` y al menos un evento `Transfer` del contrato oficial USDT-BSC `0x55d398326f99059ff775485246999027b3197955` hacia nuestra dirección, con suma ≥ 19 USDT (18 decimales, aritmética BigInt exacta). Éxito → `localStorage.factux_pro = 1`.
2. **PayPal:** el comprador envía US$19 a `chachiafk@gmail.com`, reenvía su recibo al mismo correo y recibe un código de activación. **Esquema del código:** `código = primeros 16 caracteres hex de SHA-256("CHACHI-PRO-" + email_en_minúsculas_sin_espacios)`. El JS lo recalcula con `crypto.subtle` y lo compara con lo que pega el usuario. (Nota operativa: el código lo genera el agente principal/o Papi al recibir el recibo; nunca se publica la fórmula al comprador, solo se le entrega su código.)

## Distribución
- Outreach directo a freelancers LATAM (diseñadores, programadores, consultores) en comunidades de Facebook, WhatsApp y Telegram de freelancers RD/MX/CO.
- Directorios de herramientas para freelancers y posts en español (X, Threads, Reddit r/freelance_es, grupos de Facebook).
- SEO orgánico: página 100% en español sobre "generador de facturas gratis latinoamérica" (competencia angloparlante).
- Cross-promo con los otros activos de Chachi.

## Criterio de muerte
**0 ventas con ≥300 visitas en 60 días → se mata (fecha: 2026-12-09).**

## No-duplicación (verificado contra contador-negocios.md, 24 negocios)
- **ContractKit (#9):** contratos + invoices para freelancers **US, en inglés**, con late-fee. Factux es 100% español, sin contratos, enfocado en ITBIS/RNC/monedas LATAM.
- **PropOne (#22):** generador de **propuestas, en inglés**. Factux genera **facturas y cotizaciones**, no propuestas.
- Ningún otro de los 24 negocios es un generador de facturas en español para LATAM. **No duplica ninguno.**
