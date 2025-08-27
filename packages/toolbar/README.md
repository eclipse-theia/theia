<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - TOOLBAR EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/toolbar` extension contributes a global toolbar to the application shell. The toolbar supplements the `Command Palette` and allows users to easily add, remove, and rearrange toolbar items to their liking. The toolbar is hidden by default and ships with a default layout which can be overridden by downstream applications. Extenders can also contribute custom widgets to the toolbar through a contribution point.

### Icon Management

When a new item is added to the toolbar, a dialog appears showing all installed icons. This feature allows users to easily select a suitable icon for their toolbar item without needing to know the icon names in advance. The dialog visually displays available icons from both the FontAwesome and Codicons libraries.

The `update-icons.js` script collects the icon strings for FontAwesome and Codicons from the currently installed dependencies and saves them to temporary JSON files. The content is then copied to `codicon.ts` and `font-awesome-icons.ts` to update the icon lists.
A util npm script is available: `npm run update:icons`.

## Additional Information

An example toolbar custom widget and layout override can be found in [here](https://github.com/eclipse-theia/theia/tree/master/examples/api-samples/src/browser/toolbar).

- [API documentation for `@theia/toolbar`](https://eclipse-theia.github.io/theia/docs/next/modules/toolbar.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
