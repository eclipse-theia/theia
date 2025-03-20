<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - PLUGIN-EXT EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/plugin-ext` extension contributes functionality for the `plugin` API.

## Implementation

The implementation is inspired from: <https://blog.mattbierner.com/vscode-webview-web-learnings/>.

## Environment Variables

- `THEIA_WEBVIEW_EXTERNAL_ENDPOINT`

  A string pattern possibly containing `{{uuid}}` and `{{hostname}}` which will be replaced. This is the host for which the `webviews` will be served on.
  It is a good practice to host the `webview` handlers on a sub-domain as it is more secure.
  Defaults to `{{uuid}}.webview.{{hostname}}`.

## Security Warnings

- Potentially Insecure Host Pattern

  When you change the host pattern via the `THEIA_WEBVIEW_EXTERNAL_ENDPOINT` environment variable warning will be emitted both from the frontend and from the backend.
  You can disable those warnings by setting `warnOnPotentiallyInsecureHostPattern: false` in the appropriate application configurations in your application's `package.json`.

## Naming in this package

This package has a different folder structure than other Theia packages. Stuff in the "hosted" folder is meant to be scoped to a front end,
whereas "main" is global to a back end instance. Code in "plugin" runs inside the plugin host process. But be aware that this is not always the case,
for example the plugin manifest scanners (e.g. `scanner-theia.ts`) are in the `hosted` folder, even though they a global concern.

## Additional Information

- [API documentation for `@theia/plugin-ext`](https://eclipse-theia.github.io/theia/docs/next/modules/plugin_ext.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
