# Qaap × Eclipse Theia — Auditoría y plan de desacoplamiento

**Base de comparación:** `upstream/master` (Eclipse Theia)  
**Fork:** `origin/master` (Qaap)  
**Fecha de referencia:** 2026-05-16 (actualizado tras S1–S7)  
**Comandos:** `npm run qaap:drift-report`, `npm run qaap:drift-check`

---

## 1. Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Archivos distintos vs `upstream/master` | **~160** (producto + seams + examples) |
| Capa producto (`packages/qaap-*`) | **~90+** archivos (correcto) |
| Drift fuera de allowlist (baseline) | **0** (`qaap-drift-baseline.txt` vacío) |
| Violaciones sin allowlist | **0** (`qaap:drift-check` OK) |
| Guard CI drift nuevo | **Sí** (`qaap:drift-check`) |
| GitHub Actions | **Sí** (`.github/workflows/qaap-drift-check.yml`) |
| Objetivo desacoplamiento (S1–S7) | **Cumplido** |

La **lógica de producto vive en `packages/qaap-*`**. Upstream solo conserva **seams documentados** (allowlist en `scripts/qaap-drift-check.js`): rebinds, hooks, `forceNavigate`, workspace trust factory, icono Electron, etc.

---

## 2. Arquitectura objetivo (estado actual)

```
┌─────────────────────────────────────────────────────────────┐
│  THEIA UPSTREAM (parcheado + seams documentados)            │
│  • workbench-top-bar-factory.ts                             │
│  • mobile-layout-state.ts                                   │
│  • mini-browser-open-hook / opener-options / url-utils      │
│  • monaco-quick-input-layout.ts                             │
│  • seams allowlist (ver §3.1) — sin baseline de deuda       │
└───────────────────────────┬─────────────────────────────────┘
                            │ rebind / Symbol interfaces
┌───────────────────────────▼─────────────────────────────────┐
│  ADAPTER LAYER — @theia/qaap-adapters                       │
│  MiniBrowserContent, OpenHook, MonacoQuickInputLayout       │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  PRODUCT LAYER                                              │
│  qaap-shell │ qaap-ai-config │ qaap-cloud-workspace │ qaap-mobile-shell │
│  qaap-product-theme │ qaap-element-inspector                │
│  qaap-product (umbrella + preload + electron-main)          │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  APPS — examples/browser, electron → @theia/qaap-product    │
└─────────────────────────────────────────────────────────────┘
```

### Mapa de dependencias (producto)

```
@theia/qaap-product
├── @theia/qaap-shell          → rebind ApplicationShell, SidePanelHandler, DockPanelRenderer
├── @theia/qaap-adapters       → rebind MiniBrowserOpenHook, MonacoQuickInputLayout
├── @theia/qaap-ai-config      → agent defaults, shell policy, preference branding startup
├── @theia/qaap-cloud-workspace → login OAuth, hub sync, agent tasks, deploy
├── @theia/qaap-mobile-shell   → Work Hub, mobile layout, navigator, notifications
├── @theia/qaap-product-theme  → CSS only (theiaExtensions frontend)
├── @theia/qaap-element-inspector
└── @theia/core

@theia/mini-browser → (sin dep directa; inspector vía @theia/qaap-adapters → qaap-element-inspector)
```

---

## 3. FASE 1 — Inventario de drift (histórico)

> **Estado 2026-05-16:** migración completada. La tabla siguiente es referencia histórica; el inventario activo es el **allowlist** + `packages/qaap-*`.

### 3.1 Seams y rutas permitidas (allowlist drift-check)

Además de `packages/qaap-*` y `scripts/qaap-*`, ver regex en `scripts/qaap-drift-check.js`:

| Área | Archivos seam |
|------|----------------|
| Core menú / shell móvil | `workbench-top-bar-factory`, `mobile-layout-state`, `shell/index`, `browser-menu-module`, `browser-menu-plugin`, `window-title-service` |
| mini-browser | `mini-browser-open-hook`, `opener-options`, `url-utils`, `open-handler`, `mini-browser-content` (`forceNavigate`) |
| monaco | `monaco-quick-input-layout`, `monaco-frontend-module`, `monaco-quick-input-service` |
| ai-core | `window-blink-service` (`getBlinkAlertTitle`) |
| electron | `electron-main-application` (`resolveApplicationIconPath`) |
| workspace trust | `workspace-trust-dialog`, `workspace-trust-dialog-factory`, `workspace-trust-service`, `workspace-frontend-module` |
| tooling | `.nvmrc`, `Dockerfile`, `docker-compose.yml`, examples, … |

### 3.2 Inventario histórico (pre-migración)

Archivos que **modificaban upstream** antes de S1–S7 (ya migrados a `qaap-*` o revertidos).

| Ruta | Riesgo | Sprint | Problema | Solución mantenible |
|------|--------|--------|----------|---------------------|
| `core/.../application-shell.ts` | **Crítico** | S1 | Lógica móvil/layout en core | Revertir core; solo `qaap-shell` rebind (ya existe `QaapApplicationShellWithToolbar`) |
| `core/.../status-bar.tsx` | **Crítico** | S1 | UX móvil en core | Contribution + CSS en `qaap-product-theme` |
| `core/.../additional-views-menu-widget.tsx` | **Crítico** | S1 | Menú vistas en core | Subclass en `qaap-shell` o contribution |
| `core/.../common-frontend-contribution.ts` | **Crítico** | S4 | Comandos/atajos producto | `FrontendApplicationContribution` en `qaap-mobile-shell` |
| `core/.../browser-menu-module.ts` | **Crítico** | S4 | Wiring menú | Rebind en módulo producto, no editar core |
| `core/.../browser-menu-plugin.ts` | **Crítico** | S4 | Comportamiento menú | Idem |
| `core/.../theming.ts` | **Crítico** | S4 | Tema Cursor/producto | `ColorContribution` en theme package |
| `core/.../storage-service.ts` | **Crítico** | S4 | Persistencia custom | Wrapper `@theia/qaap-runtime` (nuevo) o preference scope |
| `core/.../window-title-service.ts` | **Crítico** | S4 | Título ventana branding | Contribution rebind |
| `core/.../core-preferences.ts` | **Crítico** | S4 | Prefs globales | `qaap-product` preference schema |
| `core/i18n/nls.json` | **Crítico** | S4 | Cadenas producto | Overlay nls en producto o `nls.localize` en contributions |
| `core/.../style/index.css` | **Crítico** | S4 | CSS global en core | Mover a `qaap-product-theme` |
| `core/.../style/status-bar.css` | **Crítico** | S1 | CSS status bar | `qaap-product-theme` |
| `core/.../frontend-application-module.ts` | **Crítico** | S4 | Bindings en core | Revertir; binds en `qaap-*-frontend-module` |
| `core/.../electron-main-application.ts` | **Crítico** | S6 | Electron main | `qaap-electron` package o example override |
| `core/.../frontend-application-config-provider.spec.ts` | **Bajo** | S4 | Test acoplado | Actualizar test tras revert |
| `mini-browser/*` (11 archivos) | **Alto** | S2 | Lógica móvil duplicada con adapters | Revertir a upstream; mantener solo **seams** + `qaap-adapters` |
| `monaco/*` (7 archivos) | **Alto** | S3 | Quick input / textmate producto | Revertir; solo `monaco-quick-input-layout` seam |
| `ai-*-preferences.ts` (7) | **Medio** | S5 | Defaults API keys / modelos | `@theia/qaap-ai-config` preference contributions |
| `ai-code-completion/.../code-completion-agent.ts` | **Medio** | S5 | Comportamiento completion | Re-adopted upstream |
| `ai-core/.../window-blink-service.ts` | **Medio** | S5 | UX notificación | Seam + `qaap-mobile-shell` push contribution |
| `toolbar/.../application-shell-with-toolbar-override.ts` | **Medio** | S1 | Shell toolbar | `qaap-shell` ya extiende; alinear override |
| `workspace/...` (2) | **Medio** | S4 | Trust dialog / contributions | Upstream seam `getTrustDevelopmentHostLabel()` |
| `getting-started`, `messages`, `filesystem`, `preview`, `scanoss` | **Medio** | S4 | CSS/UX puntual | Theme o extensions |
| `.nvmrc` | **Bajo** | — | Versión Node | Mantener en repo, no en baseline tras decisión |

---

## 4. Anti-patterns detectados

| Anti-pattern | Dónde | Impacto | Remediación |
|--------------|-------|---------|-------------|
| **Fork directo del core** | 19 archivos `core/` | Merge upstream doloroso | Revert + rebind (§3) |
| **Doble implementación** | mini-browser drift + qaap-adapters | Confusión, bugs | S2: una sola vía (adapters) |
| **Deep imports `/lib/`** | Todos los `qaap-*` | Ruptura si Theia mueve rutas | Aceptable en extensiones; documentar; preferir símbolos exportados |
| **CSS en paquetes upstream** | core, mini-browser, monaco baseline | Conflictos visuales | Solo `qaap-product-theme` |
| **mini-browser → qaap-element-inspector** | `mini-browser/package.json` | Acopla runtime a producto | Seam `ElementInspector` en mini-browser (futuro) |
| **body classList en contribution** | `qaap-ai-chat-mobile` | Frágil pero aislado | OK en product layer; test UI |
| **patch-package producto** | No usado para Qaap | N/A | Usar DI; reservar `theia-patch` solo deps npm |

### Patrones correctos ya aplicados

- `rebind(WorkbenchTopBarFactory)` en `qaap-mobile-shell` (no `appendMenu` async).
- `extends AIChatContribution` + `rebind` en `qaap-mobile-shell`.
- Subclasses `SidePanelHandler`, `SideTabBar` en `qaap-shell`.
- Bridges `MiniBrowserOpenHook` / `MonacoQuickInputLayout` en `qaap-adapters`.

---

## 5. Clasificación de riesgo (global)

| Nivel | Criterio | Count aprox. |
|-------|----------|--------------|
| **Crítico** | `packages/core/*` | 19 |
| **Alto** | monaco, mini-browser | 18 |
| **Medio** | otros paquetes Theia | 15 |
| **Producto** | `packages/qaap-*` | 75 (esperado) |
| **Bajo** | examples, scripts, dev-packages | 39 |

---

## 6. Roadmap técnico (orden de ejecución)

| Sprint | Estado | Entregable principal |
|--------|--------|----------------------|
| **S1** Core shell | ✅ | `qaap-shell`, `qaap-mobile-shell`; core shell revertido |
| **S2** mini-browser | ✅ | `QaapMiniBrowserContent` en adapters; seam `forceNavigate` |
| **S3** monaco | ✅ | CSS en theme; wiring layout en allowlist |
| **S4** Core UX | ✅ | theme CSS, `qaap-product` bindings, workspace, getting-started |
| **S5** AI | ✅ | `qaap-mobile-shell` + `qaap-ai-config` + `qaap-product` branding startup |
| **S6** Hardening | ✅ | CI `qaap-drift-check.yml`; build browser en CI/CD existente |
| **S7** Baseline 0 | ✅ | `qaap-drift-baseline.txt` vacío |

### Post-S7 (opcional)

- Playwright `@qaap-mobile` (status bar, AI chat, navigator).
- Overlays i18n no inglés (`TextReplacementContribution` solo `en` hoy).
- Proponer seams upstream a Eclipse Theia.
- `packages/qaap-ai-config` solo si crece la superficie AI.

---

## 7. Estructura de carpetas (canónica)

```
packages/
  qaap-product/           # umbrella + preload + electron + i18n node
  qaap-adapters/          # bridges cross-cutting
  qaap-shell/
  qaap-ai-config/
  qaap-cloud-workspace/
  qaap-mobile-shell/
  qaap-product-theme/
  qaap-element-inspector/
  qaap-api/               # (futuro) interfaces exportadas
  qaap-ai-config/         # (opcional) si AI crece
scripts/
  qaap-drift-check.js
  qaap-drift-baseline.txt
  qaap-upstream-drift-report.js
doc/
  qaap-architecture-audit.md
.github/workflows/
  qaap-drift-check.yml
  qaap-mobile-playwright.yml
```

Paquetes **presentes** hoy: los siete `qaap-*` sin `qaap-api` ni `qaap-ai-config`. Añadir esos directorios solo cuando haya interfaces o prefs AI que justifiquen un paquete propio.

---

## 8. Estrategia CI/CD

**Implementado:** `.github/workflows/qaap-drift-check.yml`

- Checkout + `git fetch` `eclipse-theia/theia` → `upstream/master`
- `npm run qaap:drift-check` (sin `npm ci`; solo Node + git)

**Existente:** `.github/workflows/ci-cd.yml` — `npm run build`, tests.

**Opcional:**

```yaml
- run: npx playwright test --grep @qaap-mobile
```

**Deploy:** `Dockerfile` + `docker-compose.yml` en raíz (build `examples/browser` producción).

**Validación manual obligatoria** hasta tener UI tests:
1. `npm run start:browser`
2. DevTools → 375×812
3. Menú, side panel, AI chat toggle, mini-browser preview, navigator open file

---

## 9. Tests de regresión recomendados

| Área | Tipo | Qué validar |
|------|------|-------------|
| Workbench top bar | UI | Logo, tabs, no race en `appendMenu` |
| One-column shell | UI | `MOBILE_ONE_COLUMN_LAYOUT_CLASS` |
| AI chat móvil | UI | `theia-mod-mobile-ai-chat-fullwidth` |
| Navigator | UI | Colapsa panel izquierdo al abrir archivo |
| Outline restore | Unit | `transformLayoutOnRestore` strip right |
| Drift | CI | `qaap:drift-check` exit 0 |

---

## 10. Estrategia de overrides seguros

| Mecanismo | Cuándo usar | Ejemplo en Qaap |
|-----------|-------------|-----------------|
| `rebind(Symbol).toService()` | Sustituir implementación default | `ApplicationShell`, `WorkbenchTopBarFactory` |
| `bind(X).toSelf(); rebind(Y).toService(X)` | Subclass singleton | `SidePanelHandler` |
| `extends Contribution` + rebind clase | Comportamiento view/commands | `QaapAiChatMobileContribution` |
| Symbol + interface (seam) | Extensión sin fork | `MiniBrowserOpenHook` |
| CSS en theme package | Solo presentación | `qaap-*-narrow-viewport.css` |
| **Evitar** | Monkey patch, `appendMenu` async, editar upstream | — |

---

## 11. Estrategia upstream / patch

| Herramienta | Uso en Qaap |
|-------------|-------------|
| `upstream` remote | `git fetch upstream` → merge `upstream/master` |
| `theia-patch` (postinstall) | Parches npm de Theia upstream (no tocar) |
| `qaap:drift-check` | Bloquea **nuevo** drift |
| `qaap-drift-baseline.txt` | Inventario temporal; **reducir**, no ampliar |
| `patch-package` Qaap | **No** para core; solo si deps de terceros |

**Proceso merge:**
1. Branch `sync/upstream-YYYY-MM`
2. `git merge upstream/master`
3. Resolver solo seams + baseline (no re-introducir parches en core)
4. `npm run qaap:drift-check && npm run build:browser`

---

## 12. Adaptadores — estado vs plan original

| Subsistema | Estado | Paquete / notas |
|------------|--------|-----------------|
| Shell / layout / tabs | **Hecho** | `qaap-shell`, `qaap-mobile-shell` |
| mini-browser | **Hecho** | `QaapMiniBrowserContent`, lifecycle, open handler |
| monaco / quick input | **Hecho** | `QaapMonacoQuickInputLayoutBridge` + theme CSS |
| AI chat / outline / navigator / preview | **Hecho** | `qaap-mobile-shell` |
| Getting Started / workspace trust | **Hecho** | `qaap-product` welcome + upstream trust seam |
| AI branding (prefs, blink, completion) | **Hecho** | `qaap-product` startup + `qaap-mobile-shell` notifications |
| Electron icon | **Hecho** | `qaap-product` `QaapElectronMainApplication` |
| Editor gestos | **Hecho** | `mobile-editor-gesture-contribution` |
| Element inspector | **Hecho** | `qaap-element-inspector` |
| Filesystem / messages CSS móvil | **Hecho** | `qaap-product-theme` |
| Terminal | **Pendiente** | Sin adapter |
| Git | **Pendiente** | Sin adapter |
| WebSocket / runtime | **Pendiente** | Sin `qaap-runtime` |

---

## 13. Riesgos potenciales

1. **Revert application-shell sin portar delta** → rompe layout móvil (mitigar: diff review + UI 375px).
2. **Doble bind** shell en core module + qaap-shell → conflictos DI (mitigar: revert core module primero).
3. **Deep imports rotos** en upgrade Theia → compile falla (mitigar: CI compile all qaap packages).
4. **Baseline desactualizado** tras merge upstream → falsos OK (mitigar: trim paths resueltos).
5. **mini-browser sin element-inspector** en apps sin qaap-product → feature missing (documentado).

---

## 14. Comandos de mantenimiento

```bash
npm run qaap:drift-report          # inventario completo vs upstream/master
QAAP_DIFF_BASE=upstream/master npm run qaap:drift-report
npm run qaap:drift-check           # falla si hay drift NUEVO
npm run build:browser              # bundle ejemplo
npm run compile                    # solo TS
```

---

## 15. Siguiente paso inmediato

1. **Validación manual** tras cada merge upstream: `npm run build:browser`, viewport 375px, checklist §8.
2. **Playwright** móvil (opcional): etiquetar tests `@qaap-mobile`.
3. **Merge upstream:** `git fetch upstream && git merge upstream/master` → `npm run qaap:drift-check`.
4. **i18n:** ampliar `QaapTextReplacementContribution` u overlays por locale si se soportan idiomas distintos de `en`.

---

*Documento Fase 1 + cierre S1–S7 (2026-05-16). Baseline vacío; CI drift activo.*
