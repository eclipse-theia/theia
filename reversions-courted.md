# Reversions Courted

There is some code that seems like it's doing silly things, and I don't really want to figure out how to make it un-silly, so I'm going to remove it. When I do, I'm going to note here what bug the code was apparently supposed to fix so that I can check whether it was really necessary or not when I'm finally able to build.

#### `monaco-editor-provider.ts`

- `installReferencesController`
    > It looks like this was necessary because of the way editor previews and editors used to be swapped out?
    PR's involved:
        - https://github.com/eclipse-theia/theia/pull/7508
        - https://github.com/eclipse-theia/theia/pull/1459 which does something VSCode specifically chose not to do: https://github.com/microsoft/vscode/issues/45213
    > As far as I can tell, we're still getting the desired behavior from 1459
- `suppressMonacoKeybindingListener`
    > This smells very bad. It looks like we just decided not to figure out how to tell editors about keybinding changes.
    PR's involved:
        - https://github.com/eclipse-theia/theia/pull/6880
    > This appears to be working. I am able to bind new keybindings and use them in editors.
#### `monaco-editor.ts` (et al.)

I've removed the `commandService` and `instantiationService` accessors from `MonacoEditor` and replaced references to them with calls to `StandaloneServices.get()`.

PR's involved:
    - https://github.com/eclipse-theia/theia/pull/6291
    - https://github.com/eclipse-theia/theia/pull/7525
    - et al.?

    > This should work as long as different editors don't receive different instances of those services. At present, that is the case.
