---
applyTo: "packages/ai-*/**/*.ts"
description: "DI bindings, contribution types, and delegate pattern for Theia AI packages"
---

# Theia AI Instructions

<!-- Applies only to packages/ai-*/**/*.ts.
     Covers bindings, contribution patterns, and frontend-backend communication.
     General coding rules: theia-coding.instructions.md
     Full conventions: doc/coding-guidelines.md -->

## Module Bindings

AI packages expose a `ContainerModule`. Use `bindRootContributionProvider` for contribution points
(never `bindContributionProvider` — it causes memory leaks in top-level modules).

```ts
export default new ContainerModule(bind => {
    bindRootContributionProvider(bind, Agent);
    bindRootContributionProvider(bind, LanguageModelProvider);
    bind(MyAgent).toSelf().inSingletonScope();
    bind(Agent).toService(MyAgent);
});
```

## Contribution Types

Register new implementations against the appropriate contribution identifier:

| What you're adding | Bind against |
|---|---|
| A language model (e.g. new LLM backend) | `LanguageModelProvider` |
| A chat agent | `Agent` |
| A prompt variable | `AIVariableContribution` |
| A tool | `ToolProvider` |

## Frontend-Backend Communication

AI services that need backend access follow the delegate pattern in `ai-core`:
- Define the service interface in `src/common/`
- Implement the backend service in `src/node/`
- Create a frontend delegate in `src/browser/` using `ServiceConnectionProvider`:

```ts
bind(LanguageModelRegistry).toDynamicValue(ctx => {
    const provider = ctx.container.get<ServiceConnectionProvider>(RemoteConnectionProvider);
    const client = ctx.container.get<LanguageModelRegistryClient>(LanguageModelRegistryClient);
    return provider.createProxy<LanguageModelRegistry>(languageModelRegistryDelegatePath, client);
}).inSingletonScope();
```

## DI Rules

- All classes: `@injectable()` on the class, `@inject(Token)` on each injected property.
- Use `@postConstruct` for initialization (never the constructor for DI-injected work).
- Never use `new` to instantiate DI-managed classes — bind them and let the container resolve.

## Common Mistakes

- Implementing `LanguageModelProvider` without registering against the token — it won't be discovered.
- Calling backend services directly from `browser/` — go through a delegate or RPC service.
- Using `bindContributionProvider` instead of `bindRootContributionProvider` in the frontend module.
- Creating a new AI package when the functionality fits an existing `ai-*` package.
