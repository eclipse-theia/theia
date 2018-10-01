# Theia - Keymaps Extension

See [here](https://www.theia-ide.org/doc/index.html) for a detailed documentation.

An extension that allows the user to reconfigure default keybindings with custom keymaps. By modifying the appropriate `keymaps.json`, the user can modify existing keybindings, or add keybindings to commands that do not yet have a keybinding associated to them.

Example of a valid `keymaps.json` file

```json
[
    {
        "command": "quickCommand",
        "keybinding": "ctrl+shift+f4"
    }
]
```
 where `command` is a unique command id and keybinding is a valid `keybinding`. There's also an optional `context` property that can be specified (which is also a unique string for a context id).

 ## Supported keys

For most keys you can directly use the name of the key i.e `a`, `3`,  `/`, `-`.

To use `ctrl` on Linux/Windows and `cmd` on OSX, use `ctrlcmd`.

You can use `shift`, `ctrl`, `alt`, `meta`, `option` (`alt`), `command` (`meta`), `cmd` (`meta`) as modifiers. Note that if you defined a custom shortcut with `cmd`, `command` or `meta`, the same keymaps file won't work on a Windows/Linux machine as this key doesn't have an equivalent.

You can also use the following strings for special keys: `backspace`, `tab`, `enter`, `return`, `capslock`, `esc`, `escape`, `space`, `pageup`, `pagedown`, `end`, `home`, `left`, `up`, `right`, `down`, `ins`, `del` and `plus`.

If unsure you can always look at [keys.ts](../core/src/common/keys.ts#207) to see if a string is supported.

## Key sequences

Key sequences like: `ctrl+x ctrl+a` or `ctrl+a b c` are supported.  With the following limitations:
 - If the key sequence exceeds 1 key chord it won't show in the electron menu.
 - If the key sequence exceeds 2 key chords it won't show in the command palette.

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)