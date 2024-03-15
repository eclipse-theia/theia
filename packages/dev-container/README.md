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
Currently only a small number of configuration file properties are implemented. Those include the following:
- name
- Image
- dockerfile/build.dockerfile
- build.context
- location
- forwardPorts
- mounts

see `main-container-creation-contributions.ts` for how to implementations or how to implement additional ones. 


## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
