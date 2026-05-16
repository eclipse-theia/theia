# Qaap × Eclipse Theia — Auditoría y plan de desacoplamiento

**Base de comparación:** `upstream/master` (Eclipse Theia)  
**Fork:** `origin/master` (Qaap)  
**Fecha de referencia:** 2026-05-15  
**Comandos:** `npm run qaap:drift-report`, `npm run qaap:drift-check`

---

## 1. Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Archivos distintos vs upstream | **166** |
| Capa producto (`packages/qaap-*`) | **~75** archivos (correcto) |
| Drift fuera de allowlist (baseline) | **48** rutas (deuda técnica) |
| Core modificado (`packages/core`) | **19** rutas |
| Guard CI drift nuevo | **Sí** (`qaap:drift-check`) |
| Guard en GitHub Actions | **No** (pendiente) |
| Objetivo global cumplido | **~40%** |

La **arquitectura en capas está definida y operativa** para el workbench móvil. El **core upstream no está aún mínimo**: 48 archivos siguen parcheados directamente.

---

## 2. Arquitectura objetivo (estado actual)

```
┌─────────────────────────────────────────────────────────────┐
│  THEIA UPSTREAM (parcheado + seams documentados)            │
│  • workbench-top-bar-factory.ts                             │
│  • mobile-layout-state.ts                                   │
│  • mini-browser-open-hook / opener-options / url-utils      │
│  • monaco-quick-input-layout.ts                             │
│  • + 48 archivos en qaap-drift-baseline.txt (pendiente)     │
└───────────────────────────┬─────────────────────────────────┘
                            │ rebind / Symbol interfaces
┌───────────────────────────▼─────────────────────────────────┐
│  ADAPTER LAYER — @theia/qaap-adapters                       │
│  MiniBrowserOpenHook, MonacoQuickInputLayout bridges        │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  PRODUCT LAYER                                              │
│  qaap-shell │ qaap-extensions │ qaap-mobile-shell           │
│  qaap-product-theme │ qaap-element-inspector                │
│  qaap-product (umbrella)                                    │
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
├── @theia/qaap-extensions     → rebind AIChat, Outline, Debug, FileNavigator
├── @theia/qaap-mobile-shell   → rebind WorkbenchTopBarFactory, mobile contributions
├── @theia/qaap-product-theme  → CSS only (theiaExtensions frontend)
├── @theia/qaap-element-inspector
└── @theia/core

@theia/mini-browser → @theia/qaap-element-inspector  (acoplamiento conocido, pendiente)
```

---

## 3. FASE 1 — Inventario de drift (baseline)

Archivos que **aún modifican upstream** y deben migrarse o revertirse. Sprint asignado en §6.

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
| `ai-code-completion/.../code-completion-agent.ts` | **Medio** | S5 | Comportamiento completion | Subclass + rebind en qaap-extensions |
| `ai-core/.../window-blink-service.ts` | **Medio** | S5 | UX notificación | Optional rebind adapter |
| `toolbar/.../application-shell-with-toolbar-override.ts` | **Medio** | S1 | Shell toolbar | `qaap-shell` ya extiende; alinear override |
| `workspace/...` (2) | **Medio** | S4 | Trust dialog / contributions | `qaap-extensions` contributions |
| `getting-started`, `messages`, `filesystem`, `preview`, `scanoss` | **Medio** | S4 | CSS/UX puntual | Theme o extensions |
| `.nvmrc` | **Bajo** | — | Versión Node | Mantener en repo, no en baseline tras decisión |

### Seams permitidos en core (allowlist drift-check)

| Archivo | Propósito |
|---------|-----------|
| `workbench-top-bar-factory.ts` | `rebind(WorkbenchTopBarFactory)` → Qaap top bar |
| `mobile-layout-state.ts` | `MOBILE_NARROW_VIEWPORT_MEDIA_QUERY`, helpers TS |
| `shell/index.ts` | Export seam |
| `mini-browser-open-hook.ts` | Hook ciclo de vida preview |
| `mini-browser-opener-options.ts` | Opciones apertura |
| `mini-browser-url-utils.ts` | Normalización URL |
| `monaco-quick-input-layout.ts` | Layout quick pick móvil |

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
| **Baseline como deuda permanente** | 48 entradas | Falsa sensación de “limpio” | Reducir cada sprint |
| **patch-package producto** | No usado para Qaap | N/A | Usar DI; reservar `theia-patch` solo deps npm |
| **Drift-check no en CI** | `.github/workflows` | Regresiones silenciosas | Añadir job (§8) |

### Patrones correctos ya aplicados

- `rebind(WorkbenchTopBarFactory)` en `qaap-mobile-shell` (no `appendMenu` async).
- `extends AIChatContribution` + `rebind` en `qaap-extensions`.
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

### S1 — Core shell (prioridad 1)
**Objetivo:** `application-shell.ts`, `status-bar`, `additional-views-menu` = upstream; comportamiento solo en `qaap-shell`.

1. `git diff upstream/master -- packages/core/src/browser/shell/application-shell.ts` → portar delta restante a `QaapApplicationShellWithToolbar`.
2. Revertir los 3 archivos core.
3. `npm run build:browser` + viewport 375px.
4. Quitar rutas de `qaap-drift-baseline.txt`.

### S2 — mini-browser
**Objetivo:** Solo seams + `@theia/qaap-adapters`; handler/content upstream.

1. Revertir 8 archivos baseline excepto hook/opener/url-utils.
2. Verificar `DefaultQaapMiniBrowserLifecycle` cubre el delta.
3. Recortar baseline.

### S3 — monaco
**Objetivo:** Solo `monaco-quick-input-layout` seam.

1. Revertir `monaco-quick-input-service`, textmate, CSS.
2. CSS → `qaap-monaco-quick-input-narrow.css` (ya en theme).
3. Recortar baseline.

### S4 — Core UX restante
`common-frontend-contribution`, menus, theming, storage, nls, workspace, getting-started CSS.

### S5 — AI providers
Paquete `qaap-ai-config` o extensions con `PreferenceContribution` sin tocar 7 forks.

### S6 — Hardening + upstream process
- CI job `qaap:drift-check` + `build:browser`.
- Playwright: status bar móvil, AI chat fullwidth, navigator collapse.
- Documentar merge: `git fetch upstream && git merge upstream/master`.

### S7 — Baseline = 0
Eliminar `qaap-drift-baseline.txt` cuando no queden violaciones.

---

## 7. Estructura de carpetas ideal (objetivo final)

```
packages/
  qaap-product/              # umbrella dependency
  qaap-api/                  # (futuro) interfaces públicas del producto
  qaap-shell/
  qaap-adapters/
  qaap-extensions/
  qaap-mobile-shell/
  qaap-product-theme/
  qaap-element-inspector/
  qaap-ai-config/            # (futuro) S5
  qaap-electron/             # (futuro) main-process
scripts/
  qaap-drift-check.js
  qaap-drift-baseline.txt    # → vacío al final
  qaap-upstream-drift-report.js
doc/
  qaap-architecture-audit.md # este documento
```

---

## 8. Estrategia CI/CD

```yaml
# Propuesta: .github/workflows/qaap-product.yml
- run: npm run qaap:drift-check
- run: npm run build:browser
# Opcional:
- run: npx playwright test --grep @qaap-mobile
```

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
| mini-browser | **Parcial** | adapters + drift baseline |
| monaco / quick input | **Parcial** | adapters + drift baseline |
| AI chat / outline / navigator | **Hecho** | `qaap-extensions` |
| Editor gestos | **Hecho** | `mobile-editor-gesture-contribution` |
| Element inspector | **Hecho** | `qaap-element-inspector` |
| Terminal | **Pendiente** | Sin adapter |
| Git | **Pendiente** | Sin adapter |
| Filesystem | **Pendiente** | Solo CSS drift |
| WebSocket / runtime | **Pendiente** | Sin `qaap-runtime` |
| Webviews | **Pendiente** | mini-browser cubre parte |
| AI preferences | **Pendiente** | 7 archivos baseline |

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

**S1 — Core shell:** revertir `application-shell.ts` en core portando cualquier delta restante a `packages/qaap-shell/src/browser/qaap-application-shell-with-toolbar.ts`.

---

*Documento generado como Fase 1 del plan de arquitectura Qaap. Actualizar al cerrar cada sprint (recortar baseline, marcar adaptadores completados).*
