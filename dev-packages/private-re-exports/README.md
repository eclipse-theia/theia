# `@theia/re-export`

Utility package to re-export dependencies.

This is useful when you use and expose some APIs from a dependency and want
your dependent to get access to the exact same symbols as you did.

## `package.json`

You can configure how the `theia-re-export` CLI will generate re-exports
through your `package.json` file with a `theiaReExports` key:

```json
{
    "theiaReExports": {
        "destination": {
            "export *": [
                "packages that export via *"
            ],
            "export =": [
                "packages that export via ="
            ],
            "copy": "other-package#destination"
        }
    }
}
```

### `transitive`

If you want to re-export packages from another package that also re-exports
its dependencies. We use this in `@theia/core` to simplify the consumption
of some optional Electron-specific dependencies.

### `export *`

Packages that export their symbols as `export const x = ...`.

### `export =`

Packages that export their symbols as a namespace like `export = ...`.
