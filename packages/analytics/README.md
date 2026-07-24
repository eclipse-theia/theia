# Theia Analytics Extension

The `@theia/analytics` extension provides a backend-independent API for reporting typed analytics events from frontend and backend Theia features. Applications contribute backend sinks and users control which topics each sink may receive.

Theia does not ship a backend or vendor transport with this extension. Analytics is disabled by default and routes default to an empty object, so no event is delivered without explicit configuration.

## Report typed events

Inject `AnalyticsService` and define payloads alongside the producing feature. Named interfaces do not need an index signature. Values may be strings, numbers, booleans, or mutable or readonly homogeneous arrays of those primitive types.

```typescript
import { AnalyticsService } from '@theia/analytics/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';

interface BuildCompletedData {
    duration: number;
    successful: boolean;
    targets: readonly string[];
}

@injectable()
export class BuildReporter {
    @inject(AnalyticsService)
    protected readonly analytics: AnalyticsService;

    report(duration: number, targets: string[]): void {
        this.analytics.report<BuildCompletedData>('example/build/completed', {
            duration,
            successful: true,
            targets
        });
    }
}
```

The framework assigns the report timestamp and creates an immutable snapshot of accepted producer data without semantically transforming its values. It does not enrich, redact, truncate, filter, or impose size limits. Producers remain responsible for selecting safe topics and payload values.

## Contribute a backend sink

A sink declares a unique slash-separated ID and immutable topic interests. Bind it to `AnalyticsSink` in a backend module; the analytics package discovers startup contributions through its root contribution provider.

```typescript
import { AnalyticsEvent } from '@theia/analytics/lib/common';
import { AnalyticsSink } from '@theia/analytics/lib/node';
import { ContainerModule, injectable } from '@theia/core/shared/inversify';

@injectable()
class ApplicationAnalyticsSink implements AnalyticsSink {
    readonly id = 'example/backend';
    readonly interests = ['example/build/*'] as const;

    handle(event: AnalyticsEvent): void {
        // Forward the permitted event using an application-owned transport.
    }
}

export default new ContainerModule(bind => {
    bind(ApplicationAnalyticsSink).toSelf().inSingletonScope();
    bind(AnalyticsSink).toService(ApplicationAnalyticsSink);
});
```

A sink receives an event only when all of the following are true:

1. `analytics.enabled` is `true`;
2. a valid pattern in `analytics.routes[sink.id]` matches the event topic; and
3. one of the sink's valid declared interests matches the event topic.

For example:

```json
{
  "analytics.enabled": true,
  "analytics.routes": {
    "example/backend": ["example/build/*"],
    "example/audit": ["example/build/completed"]
  }
}
```

Routes are user-scoped. Missing and empty routes deny delivery. Invalid routes are ignored and never broaden access. Supported patterns are exact topics, terminal prefix patterns such as `example/build/*`, and the global `*` pattern.

## Configure preferences

Analytics supports two preference configuration paths.

### Persisted user settings

Users can configure `analytics.enabled` and `analytics.routes` in their settings. Frontend and backend preference services observe the same user configuration files, and persisted user values override application defaults.

### Application defaults

Applications can register defaults for the existing analytics preferences with a shared `PreferenceContribution`:

```typescript
import { PreferenceContribution, PreferenceSchemaService } from '@theia/core/lib/common';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class AnalyticsDefaultsContribution implements PreferenceContribution {
    initSchema(service: PreferenceSchemaService): Promise<void> {
        service.registerOverride('analytics.enabled', undefined, true);
        service.registerOverride('analytics.routes', undefined, {
            'example/backend': ['example/build/*']
        });
        return Promise.resolve();
    }
}
```

Bind the same contribution in both the application's frontend and backend modules so their defaults remain aligned:

```typescript
bind(PreferenceContribution).to(AnalyticsDefaultsContribution).inSingletonScope();
```

Do not re-declare `analytics.enabled` or `analytics.routes` in a second preference schema: duplicate schema properties are ignored and do not replace the original defaults. `theia.frontend.config.preferences` may still provide frontend-only defaults, but it is insufficient by itself for backend-authoritative analytics delivery. Applications that enable analytics by default must use equivalent frontend and backend overrides so the browser optimization and backend policy agree.

## Compatibility adapters

A downstream application can implement `AnalyticsSink` as an adapter to an existing analytics SDK or service. Keep the native topic and payload contract at the producer boundary, then translate only inside the application-owned sink. This isolates vendor APIs and allows the same route and interest policy to govern the adapter.

Sinks own transport, sink-specific filtering, identity, buffering, batching, retry, ordering, persistence, flushing, and lifecycle. They may use normal backend lifecycle contributions when initialization or shutdown behavior is required.

## Scope

The version-one framework intentionally does not provide runtime sink registration, replay, frontend policy filtering, decorators, automatic context, persistent identifiers, a schema registry, or generic delivery lifecycle APIs. VS Code plugin telemetry preferences and events are unchanged and are not bridged to native analytics.
