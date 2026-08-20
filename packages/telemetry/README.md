<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - TELEMETRY EXTENSION</h2>

<hr />

</div>

## Description

The experimental `@theia/telemetry` extension provides a typed service for reporting usage, error, and crash events from Theia frontends and backends. Applications decide where events go by contributing local or remote backend sinks; without a sink, the framework sends data nowhere.

Remote sinks are gated by the user-scoped `telemetry.telemetryLevel` preference, which defaults to `off`. Local sinks keep data on the machine and bypass consent, but all sinks respect `telemetry.filters`. A missing filter entry allows all declared sink interests, an empty array disables that sink, and a non-empty array restricts delivery to matching topics.

```typescript
import { TelemetryEvent } from '@theia/telemetry/lib/common';
import { TelemetrySink } from '@theia/telemetry/lib/node';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
class ApplicationTelemetrySink implements TelemetrySink {
    readonly id = 'example/backend';
    readonly interests: readonly string[] = ['example/build/*'];
    readonly scope: 'local' | 'remote' = 'remote';

    handle(event: TelemetryEvent): void {
        // Forward the permitted event using an application-owned transport.
    }
}
```

Producers inject `TelemetryService` and report events with slash-separated topics:

```typescript
telemetryService.report('example/build/completed', {
    duration: 1200,
    successful: true
});
```

See the [API samples](../../examples/api-samples) for a complete command and sink example, and the generated [`@theia/telemetry` API documentation](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_telemetry.html) for the public contracts.

## Customize consent

The frontend and backend modules bind the preference-backed `TelemetryConsentProvider` by default. Applications may rebind it to source consent from their own opt-in mechanism. `TelemetryConsentProvider.onDidChangeTelemetryLevel` is the hook for application-owned reactions to consent changes; the framework does not send opt-out notifications.

Applications that override defaults for `telemetry.telemetryLevel` or `telemetry.filters` must register equivalent `PreferenceContribution` overrides in both frontend and backend containers. This keeps the frontend forwarding optimization aligned with the backend-authoritative policy. `theia.frontend.config.preferences` configures frontend defaults only and is insufficient by itself for backend telemetry policy.

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
