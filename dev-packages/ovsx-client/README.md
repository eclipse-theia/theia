<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - OVSX CLIENT</h2>

<hr />

</div>

## Description

The `@theia/ovsx-client` package is used to interact with `open-vsx` through its REST APIs.
The package allows clients to fetch extensions and their metadata, search the registry, and
includes the necessary logic to determine compatibility based on a provided supported API version.

Note that this client only supports a subset of the whole OpenVSX API, only what's relevant to
clients like Theia applications.

### `OVSXRouterClient`

This class is an `OVSXClient` that can delegate requests to sub-clients based on some configuration (`OVSXRouterConfig`).

```jsonc
{
    "registries": {
        // `[Alias]: URL` pairs to avoid copy pasting URLs down the config
    },
    "use": [
        // List of aliases/URLs to use when no filtering was applied.
    ],
    "rules": [
        {
            "ifRequestContains": "regex matched against various fields in requests",
            "ifExtensionIdMatches": "regex matched against the extension id (without version)",
            "use": [/*
                List of registries to forward the request to when all the
                conditions are matched.

                `null` or `[]` means to not forward the request anywhere.
            */]
        }
    ]
}
```

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
