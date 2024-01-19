<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - EXAMPLE HEADLESS PLUGIN USING THE API PROVIDER SAMPLE</h2>

<hr />

</div>

## Description

An example demonstrating three Theia concepts:

- "headless plugins", being plugins loaded in a single plugin host Node process outside of the context of any frontend connection
- client of a custom "Greeting of the Day" API provided by the `@theia/api-provider-sample` extension
- "backend plugins", being plugins loaded in the backend plugin host process for a frontend connection

Thus this plug-in demonstrates the capability of a VS Code-compatible plugin to provide two distinct backend entry-points for the two different backend contexts.
As declared in the `package.json` manifest:
- in the headless plugin host, the entry-point script is `headless.js` via the Theia-specific the `"theiaPlugin"` object
- in the backend plugin host for a frontend connection, the entry-point script is `backend.js` via the VS Code standard `"main"` property

The plugin is for reference and test purposes only and is not published on `npm` (`private: true`).

### Greeting of the Day

The sample uses the custom `gotd` API to log a greeting upon activation.

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
