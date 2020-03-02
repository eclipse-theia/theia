<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>THEIA - PREFERENCES EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/preferences` extension implements the preferences API defined in `@theia/core`, including the four preference providers:
- `Default` Preference, which serves as default values of preferences,
- `User` Preference for the user home directory, which has precedence over the default values,
- `Workspace` Preference for the workspace, which has precedence over User Preference, and
- `Folder` Preference for the root folder, which has precedence over the Workspace Preference

To set:
- `User` Preferences: Create or edit a `settings.json` under the `.theia` folder located either in the user home.
- `Workspace` Preference: If one folder is opened as the workspace, create or edit a `settings.json` under the root of the workspace. If a multi-root workspace is opened, create or edit the "settings" property in the workspace file.
- `Folder` Preferences: Create or edit a `settings.json` under any of the root folders.

Example of a `settings.json` below:

```typescript
{
    // Enable/Disable the line numbers in the monaco editor
	"editor.lineNumbers": "off",
    // Tab width in the editor
	"editor.tabSize": 4,
	"files.watcherExclude": "path/to/file"
}
```

Example of a workspace file below:

```typescript
{
   "folders": [
      {
         "path": "file:///home/username/helloworld"
	  },
	  {
         "path": "file:///home/username/dev/byeworld"
      }
   ],
   "settings": {
      // Enable/Disable the line numbers in the monaco editor
	  "editor.lineNumbers": "off",
      // Tab width in the editor
	  "editor.tabSize": 4,
   }
}
```

## Additional Information

- [API documentation for `@theia/preferences`](https://eclipse-theia.github.io/theia/docs/next/modules/preferences.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia


# Theia - Preferences Extension



## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
