# Theia - User Storage Extension

The user storage extension provides an api for accessing user storage files, i.e preferences, custom keymaps and other user-specific files without having to know how it's implemented. User storage files can then be accessed with `userstorage` uri scheme like so `userstorage://settings.json` and the user storage service implementation will then fetch the appropriate file.

## License
[Apache-2.0](https://github.com/theia-ide/theia/blob/master/LICENSE)