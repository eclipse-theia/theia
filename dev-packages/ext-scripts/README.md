# Shared NPM script for Theia packages.

`theiaext` is a command line tool to run shared npm scripts in Theia packages.

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
