<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - SECONDARY WINDOW EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/secondary-window` extension contributes the extract command and toolbar item to move extractable widgets to secondary windows.

To mark a widget to be extractable, implement the `ExtractableWidget` interface from `@theia/core`.

### Limitations

For the extraction to work we require changes in upstream libraries.
Theia offers the `theia-patch` CLI command to apply these patches.

Recommendation: Execute `theia-patch` in the `postinstall` script of your root npm package to automatically apply the patches.

If the patches are not applied, the secondary window will show empty.

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
