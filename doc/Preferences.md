Theia has a preference service which allows modules to get preference values, contribute default preferences and listen for preference changes.

Preferences can be saved in the root of the workspace under `.theia/prefs.json` or under `$HOME/.theia/prefs.json` on Linux systems. For Windows systems, the user settings will by default be in the `%USERPROFILE%/.theia/settings.json` (something like `C:\Users\epatpol\.theia/settings.json`)

As of right now the files must contain a valid a JSON containing the names and values of preferences i.e (note that the following preference names are not official and only used as an example)

```json
{
	"monaco.lineNumbers": "off",
	"monaco.tabWidth": 4,
	"fs.watcherExcludes": "path/to/file"
}
```

Let's take the filesystem as an example of a module using the preference service

## Contributing default preferences as a module with inversify

To contribute some preference values, a module must bind the following PreferenceContribution to a value:

```typescript
export interface Preference {
    /**
     * name of preference (unique or resolved to unique later)
     */
    name: string
    defaultValue?: any
    description?: string
}

export interface PreferenceContribution {
    readonly preferences: Preference[];
}
```

For instance, the filesystem binds it like so : 
```typescript
bind(PreferenceContribution).toConstantValue({
    preferences: [{
        name: 'files.watcherExclude',
        defaultValue: defaultFileSystemConfiguration['files.watcherExclude'],
        description: "Configure glob patterns of file paths to exclude from file watching."
    }]
});

export const defaultFileSystemConfiguration: FileSystemConfiguration = {
    'files.watcherExclude': {
        "**/.git/objects/**": true,
        "**/.git/subtree-cache/**": true,
        "**/node_modules/**": true
    }
}
```

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

Although this can be used directly in the needed class, the filesystem provides a proxy preference service specific to the filesystem preferences (which uses the preference service in the background). This allows for quicker search for the preference (as you search for the preference in the filesystem preference service, and not all preferences via the more generic preference service). It's also more efficient as only the modules watching for specific preferences related to a module will be notified. To do so, there is a proxy interface for the filesystem configuration that is bound like so using the preference proxy interface:

```typescript
export type PreferenceProxy<T> = Readonly<Deferred<T>> & Disposable & PreferenceEventEmitter<T>;
export function createPreferenceProxy<T extends Configuration>(preferences: PreferenceService, configuration: T): PreferenceProxy<T> {
    const toDispose = new DisposableCollection();
    const onPreferenceChangedEmitter = new Emitter<PreferenceChangedEvent>();
    toDispose.push(onPreferenceChangedEmitter);
    toDispose.push(preferences.onPreferenceChanged(e => {
        if (e.preferenceName in configuration) {
            onPreferenceChangedEmitter.fire(e);
        }
    }));
    return new Proxy({} as any, {
        get: (_, p: string) => {
            if (p in configuration) {
                return preferences.get(p, configuration[p]);
            }
            if (p === 'onPreferenceChanged') {
                return onPreferenceChangedEmitter.event;
            }
            if (p === 'dispose') {
                return () => toDispose.dispose();
            }
            throw new Error('unexpected property: ' + p);
        }
    })
}
```
As seen above, the proxy will only fire events to the listeners that listen to that specific module configuration. This way, not all filesystem preferences users have to listen to all the preference changes, but only those that affect that module. As said above, a module could also choose to listen to all preference changes, but it's more efficient to only inject the specific proxies needed for one's preferences.

To use that proxy, simply bind it to a new type X = PreferenceProxy<CONFIGURATION_INTERFACE> and then bind(X) to a proxy using the method above.

```typescript
export interface FileSystemConfiguration {
    'files.watcherExclude': { [globPattern: string]: boolean }
}

export const FileSystemPreferences = Symbol('FileSystemPreferences');
export type FileSystemPreferences = PreferenceProxy<FileSystemConfiguration>;

export function createFileSystemPreferences(preferences: PreferenceService): FileSystemPreferences {
    return createPreferenceProxy(preferences, defaultFileSystemConfiguration);
}

export function bindFileSystemPreferences(bind: interfaces.Bind): void {
    bind(FileSystemPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get(PreferenceService);
        return createFileSystemPreferences(preferences);
    });

    bind(PreferenceContribution).toConstantValue({
        preferences: [{
            name: 'files.watcherExclude',
            defaultValue: defaultFileSystemConfiguration['files.watcherExclude'],
            description: "Configure glob patterns of file paths to exclude from file watching."
        }]
    });
}
```

Finally, to use the filesystem configuration in your module. Simply inject it where you need it (in the filesystem watcher in this example):


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

In the case of the filesystem, one would use the same proxied config as above to access the preferences i.e:

```typescript
preferences['files.watcherExclude'].then(pref => {...});
```

This works because, as we have seen it above, the proxy will simply call prefService.get('files.watcherExclude').

## TODO/FIXME for preferences
* Add comments to different settings.json
* Add autocomplete/description when modifying the settings.json from within theia
