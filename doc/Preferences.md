Theia has a preference service which allows modules to get preference values, contribute default preferences and listen for preference changes.

Preferences can be saved in the root of the workspace under `.theia/settings.json` or under `$HOME/.theia/settings.json` on Linux systems. For Windows systems, the user settings will by default be in the `%USERPROFILE%/.theia/settings.json` (something like `C:\Users\epatpol\.theia/settings.json`)

As of right now the files must contain a valid a JSON containing the names and values of preferences (note that the following preference names are not official and only used as an example). You can also add comments to the settings.json file if needed i.e

```json
{
    // Enable/Disable the line numbers in the monaco editor
	"monaco.lineNumbers": "off",
    // Tab width in the editor
	"monaco.tabWidth": 4,
	"fs.watcherExcludes": "path/to/file"
}
```

Let's take the filesystem as an example of a module using the preference service

## Contributing default preferences as a module with inversify

To contribute some preference values. A module must contribute a valid json schema that will be used to validate the preferences. A module must bind the following PreferenceContribution to a value like this:

```typescript
export interface PreferenceSchema {
    [name: string]: Object,
    properties: {
        [name: string]: object
    }
}

export interface PreferenceContribution {
    readonly schema: PreferenceSchema;
}
```

For instance, the filesystem binds it like so : 
```typescript
export const filesystemPreferenceSchema: PreferenceSchema = {
    "type": "object",
    "properties": {
        "files.watcherExclude": {
            "description": "List of paths to exclude from the filesystem watcher",
            "additionalProperties": {
                "type": "boolean"
            }
        }
    }
};

bind(PreferenceContribution).toConstantValue(
{ 
    schema: filesystemPreferenceSchema 
});
```

Here are some useful links for contributing a validation schema:

* [JSON schema spec](http://json-schema.org/documentation.html)
* [Online JSON validator](https://jsonlint.com/)
* [Online JSON schema validator](http://www.jsonschemavalidator.net/)

## Listening for a preference change via a configuration

To use the value of a preference, simply get the injected PreferenceService from the container
```typescript
const preferences = ctx.container.get(PreferenceService);
```

In the case of the filesystem, the service is fetched at the beginning for the bindings. There, you can use the onPreferenceChanged method to register a pref changed callback.

```typescript

constructor(@inject(PreferenceService) protected readonly prefService: PreferenceService
	prefService.onPreferenceChanged(e => { callback }
```

where the event received `e` is like this:

```typescript
export interface PreferenceChangedEvent {
    readonly preferenceName: string;
    readonly newValue?: any;
    readonly oldValue?: any;
}
```

Although this can be used directly in the needed class, the filesystem provides a proxy preference service specific to the filesystem preferences (which uses the preference service in the background). This allows for faster and more efficient searching for the preference (as it searches for the preference in the filesystem preference service, and not on all preferences via the more generic preference service). It's also more efficient in the sense that only the modules watching for specific preferences related to a module will be notified. To do so, there is a proxy interface for the filesystem configuration that is bound like so using the preference proxy interface:

```typescript
export type PreferenceProxy<T> = Readonly<T> & Disposable & PreferenceEventEmitter<T>;
export function createPreferenceProxy<T extends Configuration>(preferences: PreferenceService, configuration: T): PreferenceProxy<T> {
    /* Register a client to the preference server
    When a preference is received, it is validated against the schema and then fired if valid, otherwise the default value is provided.

    This proxy is also in charge of calling the configured preference service when the proxy object is called i.e editorPrefs['preferenceName']

    It basically forwards methods to the real object, i.e dispose/ready etc.
}
```
To use that proxy, simply bind it to a new type X = PreferenceProxy<CONFIGURATION_INTERFACE> and then bind(X) to a proxy using the method above.

```typescript
export interface FileSystemConfiguration {
    'files.watcherExclude': { [globPattern: string]: boolean }
}

export const FileSystemPreferences = Symbol('FileSystemPreferences');
export type FileSystemPreferences = PreferenceProxy<FileSystemConfiguration>;

export function createFileSystemPreferences(preferences: PreferenceService): FileSystemPreferences {
    return createPreferenceProxy(preferences, defaultFileSystemConfiguration, filesystemPreferenceSchema);
}

export function bindFileSystemPreferences(bind: interfaces.Bind): void {

    bind(FileSystemPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get(PreferenceService);
        return createFileSystemPreferences(preferences);
    });

    bind(PreferenceContribution).toConstantValue({ schema: filesystemPreferenceSchema });

}
```

Finally, to use the filesystem configuration in your module. Simply inject it where you need it. You can then access the preference like so (filesystem example) :

```typescript
const patterns = this.preferences['files.watcherExclude'];
```

and you can also register for preference change like so:

```typescript
this.toDispose.push(preferences.onPreferenceChanged(e => {
    if (e.preferenceName === 'files.watcherExclude') {
        this.toRestartAll.dispose();
    }
}));
```


```typescript
constructor(...,
        @inject(FileSystemPreferences) protected readonly preferences: FileSystemPreferences) {
	...
         this.toDispose.push(preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'files.watcherExclude') {
                this.toRestartAll.dispose();
            }
        }));
	...
}
```

## Preference flow when modifying a preference

As of right now, when a settings.json is modified either in the ${workspace}/.theia/ or in the `os.homedir()`/.theia/, this will trigger an event from the JSON preference server. Currently, there's a CompoundPreferenceServer that manages the different servers (scopes) like workspace/user/defaults (provided via the contributions above). Next, the PreferenceService manages this server and adds a more convenient api on top of it (i.e getBoolean, getString etc.). It also allows clients to registers for preference changes. This PreferenceService can then be used either directly via injection in the modules, or via a more specific proxy (like the filesystem configuration from above).

In the case of the preference file being modified, the flow would then be:

.theia/settings.json -> JsonPreferenceServer -> CompoundPreferenceServer -> PreferenceService -> PreferenceProxy<FileSystemConfiguration> -> FileSystemWatcher

## Fetching the value of a preference

In the case of the filesystem, one would use the same proxied config as above to access the preferences.

```typescript
    if (this.prefService['preferenceName']) {
    ...
    }
    
    if (this.prefService['preferenceName2']) {
    ...
    }
})
```

This works because, as we have seen it above, the proxy will simply call prefService.get('preferenceName').

## TODO/FIXME for preferences
* Add scopes with server priority in CompoundPreferenceServer
* Add autocomplete/description when modifying the settings.json from within theia
