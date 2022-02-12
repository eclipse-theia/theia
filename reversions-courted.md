# Reversions Courted

There is some code that seems like it's doing silly things, and I don't really want to figure out how to make it un-silly, so I'm going to remove it. When I do, I'm going to note here what bug the code was apparently supposed to fix so that I can check whether it was really necessary or not when I'm finally able to build.

#### `monaco-editor-provider.ts`

- `installReferencesController`
    > It looks like this was necessary because of the way editor previews and editors used to be swapped out?
    PR's involved:
        - https://github.com/eclipse-theia/theia/pull/7508
        - https://github.com/eclipse-theia/theia/pull/1459 which does something VSCode specifically chose not to do: https://github.com/microsoft/vscode/issues/45213
- `suppressMonacoKeybindingListener`
    > This smells very bad. It looks like we just decided not to figure out how to tell editors about keybinding changes.
    PR's involved:
        - https://github.com/eclipse-theia/theia/pull/6880
#### `monaco-editor.ts` (et al.)

I've removed the `commandService` and `instantiationService` accessors from `MonacoEditor` and replaced references to them with calls to `StandaloneServices.get()`.

PR's involved:
    - https://github.com/eclipse-theia/theia/pull/6291
    - https://github.com/eclipse-theia/theia/pull/7525
    - et al.?
