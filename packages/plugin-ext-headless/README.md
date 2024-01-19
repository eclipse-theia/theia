<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - HEADLESS PLUGIN-EXT EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/plugin-ext-headless` extension contributes functionality for the backend-only "headless `plugin`" API.
The plugin extension host managed by this extension is scoped to the single Theia NodeJS instance.
This is unlike the plugin extension hosts managed by the [`@theia/plugin-ext` extension][plugin-ext] which are scoped on a per-frontend-connection basis.

[plugin-ext]: ../plugin-ext/README.md

## Implementation

The implementation is derived from the [`@theia/plugin-ext` extension][plugin-ext] for frontend-scoped plugins.

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
