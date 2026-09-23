# plugin-telemetry-probe

A sample Theia/VS Code plugin that demonstrates `env.createTelemetryLogger` and the `telemetry.telemetryLevel` consent gate.

It creates a `TelemetryLogger` whose sender appends every event that survives the gate to a log file, and it logs one usage event and one error event from inside `activate()`. Those two calls are the interesting case: they run before a level pushed over RPC could arrive, so they only reach the sender because the level is seeded through the plugin manager's initialization parameters.

The flag states are recorded on activation and on every change event, so changing the preference while the application runs shows up in the same file.

**Log file:** `<os.tmpdir()>/theia-telemetry-probe.log`, one JSON object per line.

## Testing

1. Copy the plugin into the deployed `plugins` directory, as described in the [sample plugins README](../../README.md).
2. Set `telemetry.telemetryLevel` and restart.
3. `tail -f $TMPDIR/theia-telemetry-probe.log` (`/tmp` on Linux).
4. Run `Telemetry Probe: Log One Usage and One Error Event` from the command palette to log again on demand. Changing the preference while the application runs appends a fresh `state` line.

## Expected

| `telemetry.telemetryLevel` | `isTelemetryEnabled` | `delivered-usage` | `delivered-error` |
| --- | --- | --- | --- |
| `off` | false | no | no |
| `crash` | false | no | no |
| `error` | false | no | yes |
| `all` | true | yes | yes |

Plugin loggers emit only `usage` and `error` events, so level `crash` delivers nothing.

## License

EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
