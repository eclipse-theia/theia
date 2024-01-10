<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - Open VSX Registry Extension</h2>

<hr />

</div>

## Description

The `@theia/vsx-registry` extension provides integration with the Open VSX Registry.

### Configuration

The extension connects to the public Open VSX Registry hosted on `http://open-vsx.org/`.
One can host own instance of a [registry](https://github.com/eclipse/openvsx#eclipse-open-vsx)
and configure `VSX_REGISTRY_URL` environment variable to use it.

### Using multiple registries

It is possible to target multiple registries by specifying a CLI argument when
running the backend: `--ovsx-router-config=<path>` where `path` must point to
a json defining an `OVSXRouterConfig` object.

See `@theia/ovsx-client`'s documentation to read more about `OVSXRouterClient`
and its `OVSXRouterConfig` configuration.

## Additional Information

- [API documentation for `@theia/vsx-registry`](https://eclipse-theia.github.io/theia/docs/next/modules/vsx-registry.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
