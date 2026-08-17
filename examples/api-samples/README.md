<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - API SAMPLES</h2>

<hr />

</div>

## Description

The `@theia/api-samples` extension contains programming examples on how to use internal APIs.
The purpose of the extension is to:

- provide developers with real-world coding examples using internal APIs, dependency injection, etc.
- provide easy-to-use and test examples for features when reviewing pull-requests.

The extension is for reference and test purposes only and is not published on `npm` (`private: true`).

### Telemetry sample

The **Telemetry Samples** command category demonstrates reporting events from the frontend to the `sample/console` backend sink. Set `telemetry.telemetryLevel` to `all`, run the started and completed commands, and inspect the backend log for the topic, kind, session, timestamp, and payload. The completed command reports an `error` event with attributes. The `sample/other` event is intentionally outside the sink's interests.

Set `telemetry.telemetryLevel` to `off` to suppress the remote sink, or set `"telemetry.filters": { "sample/console": [] }` to disable it explicitly.

### Split-origin sample

Theia frontend on one origin, Node backend on another (CDN + API).

From the repository root, after `npm run build:browser`:

```sh
npm run start:split
```

Open [http://localhost:8080/](http://localhost:8080/). That page is a stand-in host app at `/`. It embeds Theia from `/theia/`:

```text
http://localhost:8080/theia/?backend=http://localhost:3000&token=S3Cr3t
```

`:3000` is the backend and does not serve the SPA. Open the SPA URL directly if you do not need the host wrapper. Serve the workbench as `/theia/` (trailing slash) so relative assets stay under the prefix.

Preload sets `Endpoint.backend` from `?backend=` (REST and WebSocket) and `POST`s `/split-origin/session` with `Authorization: Bearer` from `?token=` before Socket.IO opens. A real app can assign `Endpoint.backend` at startup and skip the query string. Wrong or missing token: loading indicator, session `POST` returns `401`.

`split-origin/start.cjs` starts the static server and the browser-example backend with:

- `THEIA_SPLIT_ORIGIN=1` — sample backend only: no SPA from Node, CORS for `THEIA_HOSTS`, connection cookie only after a successful session `POST` (WebSocket, file transfer, and mini-browser then require that cookie)
- `THEIA_SPLIT_ORIGIN_TOKEN` — expected Bearer (demo `S3Cr3t`)
- `THEIA_HOSTS=localhost:8080` — allowlist the frontend origin (not authentication)
- `THEIA_WEBVIEW_EXTERNAL_ENDPOINT={{hostname}}` and `THEIA_MINI_BROWSER_HOST_PATTERN={{hostname}}` — keep webview and mini-browser on the backend host so the local demo does not need wildcard DNS

Without `THEIA_SPLIT_ORIGIN`, a normal `npm start` of the browser example is unchanged.

### Sample mock OpenVSX server

These samples contain a mock implementation of an OpenVSX server. This is done
for testing purposes only. It is currently hosted at
`<backend-host>/mock-open-vsx/api/...`.

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
