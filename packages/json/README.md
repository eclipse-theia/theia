## JSON Extension for Theia

## Capabilities

The JSON extension supports the following features:
- Syntax Coloring for JSON including support for jsonc (i.e. comments)
- [Code completion](https://microsoft.github.io/language-server-protocol/specification#textDocument_completion) for JSON properties and values based on the document's [JSON schema](http://json-schema.org/) or based on existing properties and values used at other places in the document. JSON schemas are configured through the server configuration options.
- [Hover](https://microsoft.github.io/language-server-protocol/specification#textDocument_hover) for values based on descriptions in the document's [JSON schema](http://json-schema.org/).
- [Document Symbols](https://microsoft.github.io/language-server-protocol/specification#textDocument_documentSymbol) for quick navigation to properties in the document.
- [Document Colors](https://microsoft.github.io/language-server-protocol/specification#textDocument_documentColor) for showing color decorators on values representing colors and [Color Presentation](https://microsoft.github.io/language-server-protocol/specification#textDocument_colorPresentation) for color presentation information to support color pickers. The location of colors is defined by the document's [JSON schema](http://json-schema.org/). All values marked with `"format": "color-hex"` (VSCode specific, non-standard JSON Schema extension) are considered color values. The supported color formats are `#rgb[a]` and `#rrggbb[aa]`.
- [Code Formatting](https://microsoft.github.io/language-server-protocol/specification#textDocument_rangeFormatting) supporting ranges and formatting the whole document.
- [Diagnostics (Validation)](https://microsoft.github.io/language-server-protocol/specification#textDocument_publishDiagnostics) are pushed for all open documents
   - syntax errors
   - structural validation based on the document's [JSON schema](http://json-schema.org/).

In order to load JSON schemas, the JSON server uses NodeJS `http` and `fs` modules. For all other features, the JSON server only relies on the documents and settings provided by the client through the LSP.

## Configuration

### Settings

Clients may send a `workspace/didChangeConfiguration` notification to notify the server of settings changes.
The server supports the following settings:

- http
   - `proxy`: The URL of the proxy server to use when fetching schema. When undefined or empty, no proxy is used.
   - `proxyStrictSSL`: Whether the proxy server certificate should be verified against the list of supplied CAs.

- json
  - `format`
    - `enable`: Whether the server should register the formatting support. This option is only applicable if the client supports *dynamicRegistration* for *rangeFormatting*
    - `schema`: Configures association of file names to schema URL or schemas and/or associations of schema URL to schema content.
	  - `fileMatch`: an array or file names or paths (separated by `/`). `*` can be used as a wildcard.
	  - `url`: The URL of the schema, optional when also a schema is provided.
	  - `schema`: The schema content.

```json
	{
        "http": {
            "proxy": "",
            "proxyStrictSSL": true
        },
        "json": {
            "format": {
                "enable": true
            },
            "schemas": [
                {
                    "fileMatch": [
                        "foo.json",
                        "*.superfoo.json"
                    ],
                    "url": "http://json.schemastore.org/foo",
                    "schema": {
                    	"type": "array"
                    }
                }
            ]
        }
    }
```

### Schema configuration and custom schema content delivery

[JSON schemas](http://json-schema.org/) are essential for code assist, hovers, color decorators to work and are required for structural validation.

To find the schema for a given JSON document, the server uses the following mechanisms:
- JSON documents can define the schema URL using a `$schema` property
- The settings define a schema association based on the documents URL. Settings can either associate a schema URL to a file or path pattern, and they can directly provide a schema.
- Additionally, schema associations can also be provided by a custom 'schemaAssociations' configuration call.

Schemas are identified by URLs. To load the content of a schema, the JSON language server tries to load from that URL or path. The following URL schemas are supported:
- `http`, `https`: Loaded using NodeJS's HTTP support. Proxies can be configured through the settings.
- `file`: Loaded using NodeJS's `fs` support.
- `vscode`: Loaded by an LSP call to the client.

#### Schema associations notification

In addition to the settings, schemas associations can also be provided through a notification from the client to the server. This notification is a JSON language server specific, non-standardized, extension to the LSP.

Notification:
- method: 'json/schemaAssociations'
- params: `ISchemaAssociations` defined as follows

```ts
interface ISchemaAssociations {
	[pattern: string]: string[];
}
```
  - keys: a file names or file path (separated by `/`). `*` can be used as a wildcard.
  - values: An array of schema URLs

#### Schema content request

The schema content for schema URLs that start with `vscode://` will be requested from the client through an LSP request. This request is a JSON language server specific, non-standardized, extension to the LSP.

Request:
- method: 'vscode/content'
- params: `string` - The schema URL to request. The server will only ask for URLs that start with `vscode://`
- response: `string` - The content of the schema with the given URL

#### Schema content change notification

When the client is aware that a schema content has changed, it will notify the server through a notification. This notification is a JSON language server specific, non-standardized, extension to the LSP.
The server will, as a response, clear the schema content from the cache and reload the schema content when required again.

Notification:
- method: 'json/schemaContent'
- params: `string` the URL of the schema that has changed.