# Theia Analytics Samples

This private, optional extension demonstrates the `@theia/telemetry` producer API, browser-to-backend transport, backend policy, and a contributed sink. It is for development and testing only and is not loaded by standard Theia example applications.

## Test with the browser example

Add the sample to `examples/browser/package.json` under `dependencies`:

```json
"@theia/analytics-samples": "1.73.0",
```

For example, place it with the other `@theia` dependencies:

```json
"dependencies": {
  "@theia/ai-terminal": "1.73.0",
  "@theia/analytics-samples": "1.73.0",
  "@theia/api-provider-sample": "1.73.0"
}
```

Then run the following commands from the repository root:

```bash
npm ci
npm run build
npm run start:browser
```

The root `package.json` includes `examples/*` as npm workspaces, so the root build compiles the sample along with the other workspaces. The `npm install` step is still required after editing the browser dependencies: it links the workspace package, updates package metadata, and runs the repository's reference-generation step so `examples/browser/tsconfig.json` references `../analytics-samples`. The browser build then bundles the sample because it is a direct application dependency. Theia discovers and loads `@theia/telemetry` through the sample's dependency and both packages' `theiaExtensions` metadata.

Remove the dependency and run `npm install` again when the browser application should no longer include the sample.

## Configure delivery

Analytics is disabled and unrouted by default. Test either of the two supported preference configuration paths.

### Persisted user settings

In the running application's user `settings.json`, add:

```json
{
  "telemetry.enabled": true,
  "telemetry.filters": {
    "sample/console": ["sample/analytics/*"]
  }
}
```

The sink declares the interest `sample/analytics/*`. An event is delivered only when both this interest and the configured route match.

### Aligned application defaults

Alternatively, create a temporary `PreferenceContribution` that calls `PreferenceSchemaService.registerOverride` for the existing `telemetry.enabled` and `telemetry.filters` keys, as documented in `packages/telemetry/README.md`. Bind that same contribution in both the test application's frontend and backend modules. Do not declare a second preference schema for these keys, and remove the temporary modules after testing.

Persisted user settings override these application defaults. Keep frontend and backend overrides aligned: the browser uses the effective global enabled value to avoid unnecessary work after preferences are ready, while the backend remains authoritative for enablement, routes, and sink interests.

The browser example already starts with `examples/browser/log-config.json`, whose default level is `info`, so sample sink messages are visible without another change. To make the sample setting explicit, add this entry under `levels` in that file:

```json
{
  "defaultLevel": "info",
  "levels": {
    "analytics-samples": "info"
  }
}
```

Keep the existing entries in `levels` when making this edit.

## Run the sample

1. Open the command palette in the browser application.
2. Run these commands under the **Analytics Samples** category:
   - **Report Started Event** reports `sample/analytics/started` and is logged.
   - **Report Completed Event** reports `sample/analytics/completed` and is logged.
   - **Report Other Event** reports `sample/other` and is not logged because it does not match the route or sink interest.
3. Inspect the backend terminal for the matching topics, framework timestamps, and payloads emitted by `sample/console`.

The first two commands demonstrate scalar and homogeneous-array payloads. With either configuration path, verify that enabled reports reach the backend sink. Then disable `telemetry.enabled`, remove or empty the `sample/console` route, or replace its pattern with a nonmatching one and verify that the same commands produce no sink output. After frontend preferences are ready, the disabled case stops in the browser; backend global-off and route checks still protect every event that reaches RPC.
