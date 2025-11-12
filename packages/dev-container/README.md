<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - DEV-CONTAINER EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/dev-container` extension provides functionality to create, start and connect to development containers similiar to the
[vscode Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers).

The full devcontainer.json Schema can be found [here](https://containers.dev/implementors/json_reference/).
Currently not all of the configuration file properties are implemented. The following are implemented:

- name
- Image
- dockerfile/build.dockerfile
- build.context
- location
- forwardPorts
- mounts
- containerEnv
- remoteUser
- shutdownAction
- postCreateCommand
- postStartCommand

see `main-container-creation-contributions.ts` for how to implementations or how to implement additional ones.

Additionally adds support for `composeUpArgs` devcontainer.json property to apply additional arguments for the `docker compose up` call.
Usage: `"composeUpArgs": ["--force-recreate"]`

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
