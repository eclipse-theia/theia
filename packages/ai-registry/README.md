<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - AI REGISTRY EXTENSION</h2>

<hr />

</div>

## Description

The AI Registry package integrates Theia with a remote AI artifact registry (such as `ai-registry-core`). Users can browse approved MCP servers and install them with a single action.

### Features

- Contributes registry-approved MCP servers to the Extensions view alongside Open VSX extensions.
- Detects whether a server is installed from the registry, manually with a matching key, or has drifted from the registry config — and surfaces Install / Link / Update / Fix config / Uninstall accordingly.
- Installs servers by writing the registry's published config snippet to the existing `ai-features.mcp.mcpServers` preference.

### Product configuration

Theia products override the default tool name (`all`) and registry base URL by rebinding `AIRegistryConfiguration` in their frontend module.

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
