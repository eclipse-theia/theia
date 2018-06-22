# Theia - User Storage Extension

The user storage extension provides an api for accessing user storage files, i.e preferences, custom keymaps and other user-specific files without having to know how it's implemented. User storage files can then be accessed with `userstorage` uri scheme like so `userstorage://settings.json` and the user storage service implementation will then fetch the appropriate file.

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)