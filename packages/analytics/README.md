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

## Application defaults

Analytics is configured through `analytics.enabled` and `analytics.routes`. Applications may provide default preference values in their `package.json`:

```json
{
  "theia": {
    "frontend": {
      "config": {
        "preferences": {
          "analytics.enabled": true,
          "analytics.routes": {
            "example/backend": ["example/build/*"]
          }
        }
      }
    }
  }
}
```

`theia.frontend.config.preferences` contributes frontend defaults only. Because analytics delivery is backend-authoritative, applications that rely on application defaults rather than persisted user settings must provide equivalent backend-visible defaults through a backend `PreferenceContribution`. Persisted user preferences are visible to backend policy and override application defaults.

## Compatibility adapters

A downstream application can implement `AnalyticsSink` as an adapter to an existing analytics SDK or service. Keep the native topic and payload contract at the producer boundary, then translate only inside the application-owned sink. This isolates vendor APIs and allows the same route and interest policy to govern the adapter.

Sinks own transport, sink-specific filtering, identity, buffering, batching, retry, ordering, persistence, flushing, and lifecycle. They may use normal backend lifecycle contributions when initialization or shutdown behavior is required.

## Scope

The version-one framework intentionally does not provide runtime sink registration, replay, frontend policy filtering, decorators, automatic context, persistent identifiers, a schema registry, or generic delivery lifecycle APIs. VS Code plugin telemetry preferences and events are unchanged and are not bridged to native analytics.
