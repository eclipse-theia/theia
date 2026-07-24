# Theia Telemetry Extension

The `@theia/telemetry` extension provides a backend-independent API for reporting typed telemetry events from frontend and backend Theia features. Applications contribute backend sinks and users control which topics each sink may receive.

Theia does not ship a backend or vendor transport with this extension. Remote telemetry is disabled by default. Local sinks may still receive events that remain on the machine unless users disable or restrict them with filters.

## Report typed events

Inject `TelemetryService` and define payloads alongside the producing feature. Named interfaces do not need an index signature. Values may be strings, numbers, booleans, or mutable or readonly homogeneous arrays of those primitive types.

```typescript
import { TelemetryService } from '@theia/telemetry/lib/common';
import { inject, injectable } from '@theia/core/shared/inversify';

interface BuildCompletedData {
    duration: number;
    successful: boolean;
    targets: readonly string[];
}

@injectable()
export class BuildReporter {
    @inject(TelemetryService)
    protected readonly telemetry: TelemetryService;

    report(duration: number, targets: string[]): void {
        this.telemetry.report<BuildCompletedData>('example/build/completed', {
            duration,
            successful: true,
            targets
        });
    }
}
```

The framework assigns the report timestamp and creates an immutable snapshot of accepted producer data without semantically transforming its values. It does not enrich, redact, truncate, filter, or impose size limits. Producers remain responsible for selecting safe topics and payload values.

## Contribute a backend sink

A sink declares a unique slash-separated ID and immutable topic interests. Bind it to `TelemetrySink` in a backend module; the telemetry package discovers startup contributions through its root contribution provider.

```typescript
import { TelemetryEvent } from '@theia/telemetry/lib/common';
import { TelemetrySink } from '@theia/telemetry/lib/node';
import { ContainerModule, injectable } from '@theia/core/shared/inversify';

@injectable()
class ApplicationTelemetrySink implements TelemetrySink {
    readonly id = 'example/backend';
    readonly interests = ['example/build/*'] as const;
    readonly scope = 'remote' as const;

    handle(event: TelemetryEvent): void {
        // Forward the permitted event using an application-owned transport.
    }
}

export default new ContainerModule(bind => {
    bind(ApplicationTelemetrySink).toSelf().inSingletonScope();
    bind(TelemetrySink).toService(ApplicationTelemetrySink);
});
```

A sink receives an event only when its declared interests match the event topic and its `telemetry.filters` entry permits the topic. A missing filter entry allows all declared interests, an empty array disables the sink, and a non-empty entry restricts delivery to matching patterns. Remote sinks additionally require the event kind to be permitted by `telemetry.level`. The optional sink scope defaults to `remote`; local sinks bypass consent because their data remains on the machine, but they still respect filters.

For example:

```json
{
  "telemetry.level": "all",
  "telemetry.filters": {
    "example/backend": ["example/build/*"],
    "example/audit": ["example/build/completed"]
  }
}
```

Preferences are user-scoped. Invalid filter entries are ignored. Invalid patterns never match. Supported patterns are exact topics, terminal prefix patterns such as `example/build/*`, and the global `*` pattern.

`telemetry.level` follows the VS Code-style consent hierarchy: `off` permits no remote events, `crash` permits crash events, `error` permits error and crash events, and `all` permits usage, error, and crash events.

## Configure preferences

Telemetry supports two preference configuration paths.

### Persisted user settings

Users can configure `telemetry.level` and `telemetry.filters` in their settings. Frontend and backend preference services observe the same user configuration files, and persisted user values override application defaults.

### Application defaults

Applications can register defaults for the existing telemetry preferences with a shared `PreferenceContribution`:

```typescript
import { PreferenceContribution, PreferenceSchemaService } from '@theia/core/lib/common';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class TelemetryDefaultsContribution implements PreferenceContribution {
    initSchema(service: PreferenceSchemaService): Promise<void> {
        service.registerOverride('telemetry.level', undefined, 'all');
        service.registerOverride('telemetry.filters', undefined, {
            'example/backend': ['example/build/*']
        });
        return Promise.resolve();
    }
}
```

Bind the same contribution in both the application's frontend and backend modules so their defaults remain aligned:

```typescript
bind(PreferenceContribution).to(TelemetryDefaultsContribution).inSingletonScope();
```

Do not re-declare `telemetry.level` or `telemetry.filters` in a second preference schema: duplicate schema properties are ignored and do not replace the original defaults. `theia.frontend.config.preferences` may still provide frontend-only defaults, but it is insufficient by itself for backend-authoritative telemetry delivery. Applications that enable telemetry by default must use equivalent frontend and backend overrides so the browser optimization and backend policy agree.

## Customize consent

Both frontend and backend modules bind `TelemetryConsentProvider` to the preference-backed default implementation. Applications may rebind this service to supply consent from another source. Its `onDidChangeTelemetryLevel` event lets adopters react to changes, including sending a final opt-out notification through an application-owned sink before remote telemetry is disabled; the framework does not generate such notifications.

## Compatibility adapters

A downstream application can implement `TelemetrySink` as an adapter to an existing telemetry SDK or service. Keep the native topic and payload contract at the producer boundary, then translate only inside the application-owned sink. This isolates vendor APIs and allows the same filter and interest policy to govern the adapter.

Sinks own transport, sink-specific filtering, identity, buffering, batching, retry, ordering, persistence, and lifecycle. They may use normal backend lifecycle contributions when initialization or shutdown behavior is required.

## Scope

The version-one framework intentionally does not provide runtime sink registration, replay, decorators, automatic context, persistent identifiers, a schema registry, or generic delivery lifecycle APIs. VS Code plugin telemetry preferences and events are unchanged and are not bridged to native telemetry.
