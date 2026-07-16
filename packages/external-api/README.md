<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - EXTERNAL API EXTENSION</h2>

<hr />

</div>

## Description

This package serves HTTP APIs intended for consumption by external tools (control planes,
dashboards, CLIs, scrapers), either on a dedicated HTTP server or on Theia's main HTTP server.

Serving external APIs on their own port keeps them independent of the main server's
frontend-oriented protections: in Electron deployments the main port is sealed by the Electron
security token (making endpoints on it unreachable for external processes), while in browser
deployments it is open. The dedicated external API server behaves identically on both
platforms and has its own explicit, preference-controlled protection.

### Preferences

The external API is configured through preferences. They configure the backend and therefore
apply per user: their maximum scope is the user scope, so they cannot be overridden in
workspace settings.

- `externalApi.delivery`: Whether and how the external API is served:
  - `off` (default): The external API is not served.
  - `samePort`: Serve on the same port as the backend. Note that in Electron deployments the
    main port requires the Electron security token, so the external API is not reachable for
    external processes in this mode.
  - `separatePort`: Serve on a dedicated port, configured via `externalApi.port`.
- `externalApi.port`: Port on which the external HTTP API is served. Only used with
  `separatePort` delivery.
- `externalApi.hostname`: Hostname or IP address the dedicated server binds to. Defaults to
  `localhost`; use `0.0.0.0` to accept remote connections. Only used with `separatePort`
  delivery.
- `externalApi.token`: Bearer token required to access protected external API endpoints
  (`Authorization: Bearer <token>`). When empty (default), the external API is served without
  verification.

The backend applies preference changes immediately: the server starts, restarts, moves between
delivery modes, or stops without requiring a restart.

### Contributing endpoints

Extensions contribute endpoints by binding an `ExternalApiContribution` in their backend
module. A contribution declares the absolute path it is mounted on (no path conventions are
imposed) and registers its routes on the `ExternalApiRouter` passed to `configure`:

```typescript
@injectable()
export class MyExternalApi implements ExternalApiContribution {
    readonly path = '/api/my-feature';

    configure(router: ExternalApiRouter): void {
        router.get('/', () => RestResult.ok({ ok: true }));
        router.get('/items/:id', ({ params }) => {
            const item = this.service.find(params.id);
            return item ? RestResult.ok(item) : RestResult.notFound();
        });
        router.post('/items', { bodySchema: CreateItemRequest.SCHEMA }, async ({ body }) =>
            RestResult.created(await this.service.create(body)));
    }
}

bind(MyExternalApi).toSelf().inSingletonScope();
bind(ExternalApiContribution).toService(MyExternalApi);
```

Typed routes take care of the recurring endpoint mechanics so that all contributions of the
external API behave consistently:

- Request bodies are parsed as JSON and validated against the JSON Schema declared in the
  route options, without invoking the handler on failure: schema violations are rejected with
  `400 { "error": "invalid request", "details": [...] }` carrying the validation messages,
  malformed JSON with `400 { "error": "invalid request" }`, and bodies exceeding the size
  limit (default `1mb`, configurable per route via `jsonLimit`) with
  `413 { "error": "payload too large" }`. Unlike the stable `error` codes, `details` are
  human-readable and make no stability promise.
- Handlers return a `RestResult` (`RestResult.ok`, `created`, `accepted`, `noContent`,
  `badRequest`, `notFound`, `conflict`, ...) that is written to the response, so that
  success and error responses share one wire format (errors as `{ "error": "<code>" }`).
- Errors thrown by handlers are logged and answered with `500 { "error": "internal error" }`.
- Requests to paths no route matches are answered with `404 { "error": "not found" }`
  instead of an HTML error page.

Server-sent event streams are served through `eventStream`, which manages the connected
clients, keep-alive comments, and coalesced broadcasts:

```typescript
configure(router: ExternalApiRouter): void {
    const stream = router.eventStream('/events', {
        event: 'items',
        snapshot: () => this.service.getItems()
    });
    router.toDispose.push(this.service.onDidChangeItems(() => stream.notifyChanged()));
}
```

`configure` is called whenever the routing is rebuilt, i.e. when the external API
configuration changes. The router of the previous build is disposed beforehand: event
streams are closed automatically — so clients reconnect against the new configuration — and
contributions register their own build-scoped resources, such as the event listener above,
in the router's `toDispose` collection.

For anything the typed routes do not cover, `router.raw` exposes the underlying express
router mounted at the contribution's path (behind the token verification): existing express
routers and middlewares can be mounted there unchanged, keeping their own request handling
and response format. Errors they do not handle themselves are still reduced to the uniform
error format: server errors are answered with `500 { "error": "internal error" }`, client
errors keep their status with the HTTP status text as the error code.

The wire format is written by the `ExternalApiResponseWriter`; rebinding it changes the
format of all typed routes, validation failures, the token verification, and the fallback
error handling consistently.

### Documentation and OpenAPI

The external API describes itself: the typed routes and event streams of all contributions
are recorded and served as an OpenAPI 3.1 document at `GET /api/openapi.json`. The endpoint
is served without token verification, but scopes the document to the requester: when a token
is configured, requests without it receive a document covering only the unprotected
contributions, while requests carrying the token receive the full document. Undocumented
routes appear with their method, path, and body schema only; the optional route
documentation makes the document useful to external consumers — for generated clients,
documentation UIs, or MCP tool definitions:

```typescript
router.post('/items/query', {
    operationId: 'queryItems',
    summary: 'Query items by creation time range.',
    bodySchema: ItemQuery.SCHEMA,
    validate: body => body.from <= body.to ? undefined : 'from must not be after to',
    responses: {
        200: { description: 'The matching items.', schema: ITEM_LIST_SCHEMA }
    }
}, async ({ body }) => RestResult.ok(await this.service.query(body)));
```

- `bodySchema` is a `RestBodySchema<B>` — a JSON Schema carrying the TypeScript type of the
  bodies it accepts. A schema constant is declared once, next to the body's interface, and is
  the single place asserting that schema and type agree; the type flows into the route's
  handler and `validate` function.
- `validate` covers constraints JSON Schema cannot express — cross-field dependencies like
  the range check above — and runs on the schema-valid body: it returns `undefined` (or an
  empty string) for valid bodies, otherwise the message the request is rejected with. Prefer
  expressing constraints in the schema (e.g. non-blank strings as `"pattern": "\\S"`) so that
  they are visible to consumers of the OpenAPI document.
- A contribution's `documentation` groups its routes under an OpenAPI tag; event streams are
  documented through their options (`summary`, `dataSchema`, ...).
- Routes registered on `router.raw` are not recorded and do not appear in the document.

The document is assembled by the `OpenApiDocumentBuilder`; rebind it to customize the
document. When a token is configured, the full document declares a `bearerAuth` security
scheme on all protected operations.

When a token is configured, contributions are protected by bearer token verification;
requests failing it are answered with `401 { "error": "unauthorized" }`. A contribution with
its own authentication scheme (e.g. OAuth) or one that is conventionally public can opt out
by declaring `unprotected = true`.

### Security Considerations

- The token is stored in plain text in the user settings and transmitted as a bearer header.
  Use it to keep casual local processes out, not as a substitute for network-level security;
  prefer binding to `localhost` and use TLS-terminating reverse proxies for remote scenarios.
- Without a token, anyone who can reach the configured port can call all contributed endpoints;
  the backend logs a warning when serving without a token on a non-local hostname.

## Additional Information

- [API documentation for `@theia/external-api`](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_external-api.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
