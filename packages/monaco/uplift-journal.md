# Uplift Journal: 23-32

Colin Grant hereinafter = 'I'
I'm creating this file to track thoughts, observations, and discoveries as I work through uplifting our Monaco dependency from 23 to 32 (current as of 2/7/2022).

## 2/7/2022

Today, my main goal is to figure out what obstacles are preventing us from consuming the 

### Changes we make to Monaco

I looked over the commits that were added to the theia-ide/vscode repository as part of the last uplift relative to the VSCode repo using `git merge-base`. It looks like the changes were mainly of two kinds:
 - Most of the commits were tests of the NPM publishing system. They're not very interesting, but apparently they arrive at a functional GitHub task definition.
 - A [few changes](https://github.com/theia-ide/vscode/commit/ae832c2f8705d47596f9907828532d09354c8054) were made to include classes and interfaces that are not present in the normal `monaco-editor-core` build. It looks like Dan Arad did not include any commits that had been made to the theia-ide fork in previous work, but those may have been masked by the `git merge-base` command.

General impression is that we're really doing very little to Microsoft's code, at the moment.

### Naïvely plugging the public package into our repo

My next step was to see what would happen if we just replaced `@theia/monaco-editor-core` with `monaco-editor-core`. `yarn install` was no problem :-). And `monaco-editor-core` does come with an ESM-loadable file set. Great. But the 'official' API is exported via an `editor.api.d.ts` that is much better than our hand-written `monaco.d.ts` file, but does _not_ include anything other than the public API. That means that there are a lot of interfaces we're used to referring to (e.g. `ITextModelService`) that are not available to us. That should be remediable via a single TS flag...

#### Dev Env

Now I need to set up some stuff so that I can experiment with making changes to the VSCode repo and seeing their effect in Theia. I'll take some notes as I do that.

1. Have the VSCode repo on your system [x]
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

