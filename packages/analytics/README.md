# Theia Analytics Extension

The `@theia/analytics` extension provides a backend-independent API for reporting typed analytics events from Theia features and for delivering permitted events to backend sinks contributed by applications.

Analytics is disabled by default and routes default to an empty object, so no event is delivered without explicit user configuration. The framework preserves producer payloads and does not add identity, enrich, redact, filter, buffer, retry, or transport events.

Producers own event topics and flat payload definitions. Backend sinks own their transport, service-specific processing, and lifecycle. Theia does not ship a backend or vendor transport with this extension.

Applications decide which backend sinks to provide and which topics each sink is permitted to receive through user-scoped analytics preferences.
