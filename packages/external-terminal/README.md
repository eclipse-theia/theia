<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - EXTERNAL-TERMINAL EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/external-terminal` extension contributes the ability to spawn external terminals for `electron` applications.
The extension includes the necessary logic to spawn the appropriate terminal application for each operating system (Windows, Linux, OSX)
by identifying certain environment variables. The extension also contributes preferences to control this behavior if necessary.

**Note:** The extension does not support browser applications.

## Contributions

### Commands

- `OPEN_NATIVE_CONSOLE`: spawns an external terminal (native console) for different use-cases.

### Preferences

- `terminal.external.windowsExec`: the application executable for Windows.
- `terminal.external.linuxExec`: the application executable for Linux.
- `terminal.external.osxExec`: the application executable for OSX.

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

-   [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
-   [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
