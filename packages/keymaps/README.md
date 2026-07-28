<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - KEYMAPS EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/keymaps` allows the user to reconfigure default keybindings with custom keymaps.\
By modifying the appropriate `keymaps.json`, the user can modify existing keybindings, or add keybindings to commands that do not yet have a keybinding associated to them.

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

## Supported Keys

Printable keys use logical-character semantics. For example, `ctrl+[` means Ctrl plus the character `[`, regardless of which physical key produces it on the active keyboard layout. Bare one-code-point characters such as `a`, `3`, `/`, `^`, `§`, `²`, and `ä` can be used directly.

Use a bracketed scan code such as `ctrl+[BracketLeft]` when a binding should follow a physical key rather than a character. Scan-code names are validated against supported `KeyboardEvent.code` values.

Characters reserved by the keybinding grammar use a Unicode escape. For example, use `ctrl+[char:0x2B]` for logical `+`, `[char:0x20]` for Space as a logical character, and `[char:0x5D]` for `]`. Literal escapes such as `[char:§]` are supported when the character is not reserved. Each character token must contain exactly one Unicode code point; multi-code-point graphemes are not supported.

A logical binding that the active layout cannot produce remains visible but inactive. It becomes active automatically after switching to a layout that can produce the character. Existing keybinding strings remain valid.

To use `ctrl` on Linux/Windows and `cmd` on OSX, use `ctrlcmd`.

You can use `shift`, `ctrl`, `alt`, `meta`, `option` (`alt`), `command` (`meta`), `cmd` (`meta`) as modifiers. Note that if you defined a custom shortcut with `cmd`, `command` or `meta`, the same keymaps file won't work on a Windows/Linux machine as this key doesn't have an equivalent.

You can also use the following strings for special keys: `backspace`, `tab`, `enter`, `return`, `capslock`, `esc`, `escape`, `space`, `pageup`, `pagedown`, `end`, `home`, `left`, `up`, `right`, `down`, `ins` and `del`.

The keybinding recorder saves printable input as its logical character. On Windows, AltGr input is therefore recorded as the produced character rather than as Ctrl+Alt. Non-printable and dead-key captures use `[ScanCode]` syntax.

If unsure you can always look at the framework's [supported keys](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_core.common_keys.Key.html)

## Key Sequences

Key sequences like: `ctrl+x ctrl+a` or `ctrl+a b c` are supported.  With the following limitations:

- If the key sequence exceeds 1 key chord it won't show in the electron menu.
- If the key sequence exceeds 2 key chords it won't show in the command palette.

## Additional Information

- [API documentation for `@theia/keymaps`](https://eclipse-theia.github.io/theia/docs/next/modules/_theia_keymaps.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark

"Theia" is a trademark of the Eclipse Foundation
<https://www.eclipse.org/theia>
