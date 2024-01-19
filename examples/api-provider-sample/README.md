<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - API PROVIDER SAMPLE</h2>

<hr />

</div>

## Description

The `@theia/api-provider-sample` extension is a programming example showing how to define and provide a custom API object for _plugins_ to use.
The purpose of the extension is to:
- provide developers with realistic coding examples of providing custom API objects
- provide easy-to-use and test examples for features when reviewing pull requests

The extension is for reference and test purposes only and is not published on `npm` (`private: true`).

### Greeting of the Day

The sample defines a `gotd` API that plugins can import and use to obtain tailored messages with which to greet the world, for example in their activation function.

The source code is laid out in the `src/` tree as follows:

- `gotd.d.ts` — the TypeScript definition of the `gotd` API object that plugins import to interact with the "Greeting of the Day" service
- `plugin/` — the API initialization script and the implementation of the API objects (`GreetingExt` and similar interfaces).
  All code in this directory runs exclusively in the separate plugin-host Node process, isolated from the main Theia process, together with either headless plugins or the backend of VS Code plugins.
  The `GreetingExtImpl` and similar classes communicate with the actual API implementation (`GreetingMainImpl` etc.) classes in the main Theia process via RPC
- `node/` — the API classes implementing `GreetingMain` and similar interfaces and the Inversify bindings that register the API provider.
  All code in this directory runs in the main Theia Node process
 - `common/` — the RPC API Ext/Main interface definitions corresponding to the backend of the `gotd` plugin API

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
