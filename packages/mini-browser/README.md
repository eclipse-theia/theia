<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - MINI-BROWSER EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/mini-browser` extension provides a browser widget with the corresponding backend endpoints.

## Environment Variables

- `THEIA_MINI_BROWSER_HOST_PATTERN`

  A string pattern possibly containing `{{uuid}}` and `{{hostname}}` which will be replaced. This is the host for which the `mini-browser` will serve.
  It is a good practice to host the `mini-browser` handlers on a sub-domain as it is more secure.
  Defaults to `{{uuid}}.mini-browser.{{hostname}}`.

## Security Warnings

- Potentially Insecure Host Pattern

  When you change the host pattern via the `THEIA_MINI_BROWSER_HOST_PATTERN` environment variable warnings will be emitted both from the frontend and from the backend.
  You can disable those warnings by setting `warnOnPotentiallyInsecureHostPattern: false` in the appropriate application configurations in your application's `package.json`.

## Additional Information

- [API documentation for `@theia/mini-browser`](https://eclipse-theia.github.io/theia/docs/next/modules/mini_browser.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
