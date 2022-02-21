# Uplift Journal: 23-32

Colin Grant hereinafter = 'I'
I'm creating this file to track thoughts, observations, and discoveries as I work through uplifting our Monaco dependency from 23 to 32 (current as of 2/7/2022).

## 2/7/2022

Today, my main goal is to figure out what obstacles are preventing us from consuming the published version of `monaco-editor-core` as ES modules rather than our home-cooked `@theia/monaco-editor-core` with module loading hijinks.

### Changes we make to Monaco

I looked over the commits that were added to the `theia-ide/vscode` repository as part of the last uplift relative to the VSCode repo using `git merge-base`. It looks like the changes were mainly of two kinds:
 - Most of the commits were tests of the NPM publishing system. They're not very interesting, but apparently they arrive at a functional GitHub task definition.
 - A [few changes](https://github.com/theia-ide/vscode/commit/ae832c2f8705d47596f9907828532d09354c8054) were made to include classes and interfaces that are not present in the normal `monaco-editor-core` build. It looks like Dan Arad did not include any commits that had been made to the theia-ide fork in previous work, but those may have been masked by the `git merge-base` command.

General impression is that we're really doing very little to Microsoft's code, at the moment.

### Naïvely plugging the public package into our repo

My next step was to see what would happen if we just replaced `@theia/monaco-editor-core` with `monaco-editor-core`. `yarn install` was no problem :-). And `monaco-editor-core` does come with an ESM-loadable file set. Great. But the 'official' API is exported via an `editor.api.d.ts` that is much better than our hand-written `monaco.d.ts` file, but does _not_ include anything other than the public API. That means that there are a lot of interfaces we're used to referring to (e.g. `ITextModelService`) that are not available to us. That should be remediable via a single TS flag...

#### Dev Env

Now I need to set up some stuff so that I can experiment with making changes to the VSCode repo and seeing their effect in Theia. I'll take some notes as I do that.

1. Have the VSCode repo on your system
2. Read the docs about how to build. The operative bit is is in `vscode/build/monaco/README.md` and the command is `yarn run gulp editor-distro`
3. In our docs there's mention of changing the treeshaking level. To do that, open `vscode/build/guplfile.editor.js` and find the `shakeLevel` setting. Set it to `0`. That should ensure that we don't accidentally end up referring to some class member that happens to have been optimized out.
4. Point your dependency at the local copy, e.g.

```json
{
    "dependencies": {
        "monaco-editor-core": "file:...vscode/out-monaco-editor-core"
    }
}
```

You could probably symlink it and reduce the burden on your file system.

Getting VSCode to actually output the `.d.ts` files was a bit of a chore. The `vscode/build/lib/standalone.ts` has a line that sets the `declaration` compiler option to `false`. I wanted to make that `true`, so I changed the line in the TS file and tried to recompile and rebuild. No luck. Tried a few variants of that approach, all without success. Eventually I looked for the JS file that must be generated, and changed the code there. It would only show up in the file explorer when actually open, so somehow it's _super_ hidden. TODO: this shouldn't be that hard! Why were changes to the TS file not getting picked up?

With that change, the problems with importing types are gone. Huzzah. Probably the rest of the day will be eaten up finding all references to the global `monaco` object and replacing them with imports.

## 2/10/2022

After a couple of days of mechanical replacements, I moved onto substantive fixes yesterday. A few observations:

 - The way we've been consuming this code has made quite a muddle of things. Since _we_ wrote the `.d.ts` file, we could include private fields as public, write concrete returns for methods that are only guaranteed to return an interface, or add implementation details to interfaces where we knew what implementation we expect - and of course to mix references to API and non-API objects indiscriminately and without any indication of which is which. My principle in replacing the old system with the new has been to try to use the public API objects (`import * as Monaco from 'monaco-editor-core';`) where possible and fall back to private objects where necessary. There are still a lot of references to private API, and that has consequences for some areas of the code:
    - In non-API code, VSCode uses `const enums` and translates them to non-`const enums` in the API. As a consequence, API and non-API interfaces and classes that refer to those enums are considered incomparable by TypeScript (requires `as unknown as X`').
    - In non-API code, VSCode inlcudes `/** @internal */` JSDocs in interfaces to remove fields from the public interface. As a consequence, public API interfaces often can't satisfy the equivalent non-API interfaces.
 - There are a number of places where it looks like we may have added fixes for problems that have fixed in VSCode in the meantime. I noticed this in the implementation of the `DiffNavigator`, where we were digging into private fields to do work that was already being done in the VSCode implementation. There are probably a lot of cases like that, and I'm not going to try to to catch them in this first round. It's a lot easier to find, now, though, since we can go look at the code.

## 2/11/2022

More private API munging. It's notable how inconsistent our use of Monaco is. In some cases, we delegate to its services, in some cases, we override them, and in others, we reimplement them, without obvious rhyme or reason in the decision. Not much to do about it in this pass, but it's worth considering.

## 2/16/2022

Eventually eliminated all references to the old global `monaco` object and aligned type signatures sufficiently that the application builds and runs. A few notes on that:

 - Plugin-side code was referring to the `monaco` namespace but doesn't include it when built. I referred to our `types-impl` code instead, but that's a bit of a fudge.
 - The quick pick code was a bit tricky to type correctly. Basically, VSCode splits the separators and the items, and then creates a union type to cover both. We were using a single type. I refactored to mirror the VSCode pattern, and things compile now, but it's probably worth circling back to check on whether those types have been handled as elegantly as they should be.
 - Part of the inelegance in the match between our quick input interfaces and the implementations was in the typing of events. We refer to our `Event` type, but Monaco usually exposes `IEvent` which lacks a (listed) public `maxListeners` field. In general, we're a lot more dependent on implementations than VSCode.

To do:

 - [x] Editor context menu styling broken
 - [x] Quick pick styling broken
    > Looks like the problem is not in the styling: the selector is still present. It looks like theme details are not being loaded into the stylesheet.
    > 100% my fault, returning null instead of a string color value.
 - [x] Commands palette pretty broken.
    > - ctrl+shift+p brings up the command palette.
    > - ctrl+p + '>' does not bring up command list.
    > - ctrl+shift+p + search term -> always empty.  
    > We needed to clear the Monaco registry to allow our `QuickCommandService` to win out over one registered by Monaco at import time.
 - [x] Commands not getting added to editor context menu
    > Had to do with initialization. A thorny issue. Previous Monaco allowed users to pass in overrides any time they constructed an editor. New Monaco only applies the overrides _the first time_ an editor is constructed.
 - [x] Colorization not working for any language with an editor open _on start_.
    > Got confusing results here. Colorization seems to be failing at a check whether the model has any associated editors. But it really looks like its editor count is being incremented, and the same thing doesn't seem to be interfering with other language colorizations. PS: although the colors were working yesterady for languages other than TS, they are not working today. 
    > This also seems to have been a problem with color registrations, and appears to be working now.
    > Agh! Nevermind, suddenly it's back to TS not working, everything else working.
    > Nevermind that, too. Seems that any language that's open in an editor _on start_ won't work during that session. But anything in a language that wasn't open on start is fine.
    > Problem seems to be that at start up, mime type associations are not yet registered, so the editor gets labeled as plain text. We may not be hooking up listeners correctly to update that once more languages are known?
    > It turned out to be a problem with the handling of a private field in the `monaco-textmate-service.ts`. We were never activating tokenization for any language that had been seen before plugins were all loaded.
 - [x] Add new editor preferences.
 - [x] There's a context-menu command to open the command palette. In VSCode, that opens in the same place as the keyboard shortcut, but in Theia it's opening inside the editor.
    > Not a problem after fixing the registration of commands. That command is no longer in the context menu.
 - [x] Editor context menu 'goto' commands not working (no peek editor shown).
    > Seems this was just a consequence of slow plugin loading.

## 2/18/2022

Spent a couple of days on editor preferences. There are some annoyances. We want to follow Monaco's preferences, but two separate systems are in play there. They register one set of preferences to the general ConfigRegistry using special JSON schemata. They _also_ register preferences with a tracker for editor-specific preferences that are stored in an array accessed through a labeled enum whose fields are matched to those of `IEditorOptions`. It would be fine if those two types of registration matched each other, but there are a few unflattenings. E.g. the preference `editor.brackedPairColorization.enabled` is registered as a boolean, but the equivalent value in `IEditorOptions` is `bracketPairColorization: {enabled: boolean}`. As a consequence, we can't use `IEditorOptions` as a basis for the interface that applies to our preference proxy `EditorPreferences` - they just won't really match up. At the same time, we've got a big list of preferences that we're maintaining mostly by hand, so we can probably do better. What I've settled on is an in-app command to generate a schema and interface. There are a few complications:

 - We have to check for preferences that have platform-specific features
   > Look for references to `platform` in `src/vs/editor/common/config/editorOptions.ts` and use the code-dequoting utilities to transform the code from string to executable.
 - There are a few preferences that we want to use that are registered either outside of `monaco-editor-core` entirely or not marked as editor preferences, even though we treat them as such.
   > For preferences registered elsewhere in VSCode, look for references to the `editorConfigurationBaseNode` object defined in `src/vs/editor/common/config/editorConfigurationSchema.ts`

With that system, what we get from Monaco will be in `packages/editor/src/browser/editor-generated-preference-schema.ts`, and anything we need to modify by hand will be in `packages/editor/src/browser/editor-preferences.ts`. Hopefully the latter will be quite a bit shorter, now :-).

TODO: Make sure (i.e. write tests that prove) that our preference proxy can handle the de-flattening expected by VSCode. I think they may already exist...

### New Errors

I pulled master today, and it appears that plugins are working less well. Previously, I was getting good hovers etc. for TS, but today, the `Initializing JS/TS language features` spinner just spins. But eventually, it did stop, and then all plugin features, including peek views, appeared to be working.

## 2/21/2022

Working on the colorization-on-load bug. Definitely a problem with mime-type association timing. I also noticed as part of my debugging that there are various `-monaco-contribution.ts` files that register associations with specific files for e.g. `launch.json`, `tasks.json`. There is also a monkeypatch of the `Monaco.languages.register` function in the `monaco-frontend-application-contribution` that adds all registered languages to our list of potential language override identifiers. The former run before the latter, however, so those languages (`jsonc`, exclusively), don't get registered as language overrides - at least not that way. That may require implementing an override of the `PreferenceSchemaProvider` in the `monaco` package or `preferences` package (which depends on Monaco), so that we can get the correct behavior.

### Observations re: colorization
Language identification does fail on startup (all editors other than JSONC are incorrectly identified as `plaintext`), but events appear to be hooked up correctly so that editor languages are updated as plugins are processed, and colorization even fails for JSONC. It must not be a problem with mime-types, but something to do with colorization / tokenization itself.

In the end, it turned out that we had just missed a change in the type of a particular field, and it wasn't nicely typed in the declaration file. I'm not sure how it wasn't throwing an error: apparently `Object.keys` always returns an empty array on a `Set`, so we were never trying to call methods that didn't exist; we just also weren't doing anything at all.

### Setting definite version

I pulled the 1.64.2 tag of VSCode today to pin my implementations to that. It is a couple of weeks behind what I'd pulled from `main`, and in n just that couple of weeks,a number of private API references were broken. We really shouldn't rely on private API.
