<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA -EXT-SCRIPTS</h2>

<hr />

</div>

## Description


`theiaext` is a command line tool to run shared npm scripts in Theia packages.\
For instance, if you want add a new `hello` script that prints `Hello World`:

- add a new script to [package.json](./package.json) with the `ext:` prefix.

```json
{
    "name": "@theia/ext-scripts",
    "scripts": {
        "ext:hello": "echo 'Hello World'"
    }
}
```

- install `theiaext` in your package (the actual version can be different)

```json
{
    "name": "@theia/myextension",
    "devDependencies": {
        "@theia/ext-scripts": "^0.1.1"
    }
}
```

- you should be able to call `hello` script in the context of your package:

```shell
    npx theiaext hello
````

- and from npm scripts of your package:

```json
{
    "name": "@theia/myextension",
    "scripts": {
        "hello": "theiaext hello"
    }
}
```

## Additional Information

- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia
