---
applyTo: "packages/plugin-ext/**/*.ts"
description: "Main-Ext RPC pattern and proxy identifiers for Theia plugin-ext"
---

# Theia Plugin-Ext RPC Instructions

<!-- Applies only to packages/plugin-ext/**/*.ts.
     Covers the Main-Ext bidirectional RPC pattern used for the VS Code plugin API.
     General coding rules: theia-coding.instructions.md
     Full conventions: doc/coding-guidelines.md, doc/code-organization.md -->

## Main-Ext Pattern

Plugin API uses bidirectional RPC between the browser frontend (Main) and the plugin host (Ext).

**Interfaces** — define the RPC contract, live in `src/common/plugin-api-rpc.ts`:
- `*Main` interface: methods callable by the plugin side (`$`-prefixed)
- `*Ext` interface: methods callable by the main side (`$`-prefixed)
- Register both with `createProxyIdentifier` in `MAIN_RPC_CONTEXT` / `PLUGIN_RPC_CONTEXT`

**Implementations**:
- `*MainImpl` — in `src/main/browser/`; browser-side; injects `RPCProtocol`, holds `proxy: *Ext`
- `*ExtImpl` — in `src/plugin/`; plugin-host-side; receives `rpc: RPCProtocol` in constructor, holds `proxy: *Main`

**Getting a proxy:**
```ts
// Main side — proxy is obtained from the constructor RPCProtocol
this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.SOMETHING_EXT);

// Ext side — proxy is obtained from the constructor RPCProtocol
this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.SOMETHING_MAIN);
```

**RPC method naming**: all remotely-callable methods must be prefixed with `$`:
```ts
interface TextEditorsMain {
    $tryApplyEdits(...): Promise<boolean>;
}
```

## Common Mistakes

- Adding a new API pair without registering identifiers in `plugin-api-rpc.ts` — the proxy won't work.
- Placing `*MainImpl` in `src/plugin/` or `*ExtImpl` in `src/main/` — wrong side.
- Forgetting the `$` prefix on RPC methods — the method won't be invoked remotely.
- Using constructor injection instead of property injection in `*MainImpl` (Main side lives in the browser container and follows standard Theia DI rules).
- Passing raw Node.js paths across the RPC boundary — always use `UriComponents` or `string` URI.
