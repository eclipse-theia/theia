<div align='center'>

<br />

<img src='https://raw.githubusercontent.com/eclipse-theia/theia/master/logo/theia.svg?sanitize=true' alt='theia-ext-logo' width='100px' />

<h2>ECLIPSE THEIA - MONACO EXTENSION</h2>

<hr />

</div>

## Description

The `@theia/monaco` extension contributes the integration of the [monaco-editor](https://microsoft.github.io/monaco-editor/index.html).\
This includes:
- full-feature code editor
- diff-editor
- code snippets
- textmate grammars (theme registry, service)

## Monaco Uplifts

This package is intended to be the interface between the `@theia/monaco-editor-core` package, the project's bundling of the `monaco-editor-core` package published by the VSCode
team, and the rest of the application. When we uplift to a new version of `monaco-editor-core`, this package will need to be checked particularly thoroughly. To facilitate that
process, the steps for undertaking a Monaco uplift are outlined here.

### Setting up the VSCode side

1. Clone the VSCode repo and make sure you have the following remotes:
 - https://github.com/microsoft/vscode.git - the official VSCode repo.
 - https://github.com/theia-ide/vscode.git - Theia's fork.
2. Find the latest release tag in the official VSCode repo, and the most recent uplift branch in the Theia fork.
 > At the time of this writing the latest release tag is `1.67.2`, and the uplift branch is `monaco-uplift-2022-6`
3. Check out the release tag, cherry pick the tip of the uplift branch, and resolve any conflicts.
 > As you resolve conflicts and make changes to the VSCode repo, make sure you end up with a single commit on the uplift branch to make it easier for the next person to rebase.
4. Try to build. At the moment, this means running `yarn` and `yarn run gulp editor-distro`.
5. Fix any build errors that arise.
6. Change the version in `build/monaco/package.json`

#### Current State

 - build/gulpfile.editor.js: various changes to modify the treeshaking and output destinations.
 - build/lib/standalone.js/ts: changes to output sourcemaps etc. One small change to fix a build error due to having a directory named `model` and a file named `model.ts` in the same folder.
 - src/vs/base/browser/dompurify/dompurify.js changes for CommonJS rather than ESM
 - src/vs/base/common/marked/marked.js changes for CommonJS rather than ESM

### Setting up the Theia side

For initial testing, it's easier to point dependencies to your local VSCode.

1. Having built `monaco-editor-core` using the steps [above](#setting-up-the-vscode-side).
2. Find all references to `@theia/monaco-editor-core` in `package.json`s and replace their version with `"link:<path to your local build of monaco-editor-core>"`.
> Using `link:` means that if you subsequently make changes on the VSCode side, you only need to rebuild VSCode and then rebuild Theia to see the effects. 
3. Delete your `node_modules` and `yarn` and build Theia.
4. Fix any build errors.
5. Uncomment the `bindMonacoPreferenceExtractor` function in `examples/api-samples/src/browser/monaco-editor-preferences/monaco-editor-preference-extractor.ts` and run the commands there. Fix the `EditorGeneratedPreferenceSchema` as necessary, and add or remove validations from the `MonacoFrontendApplicationContribution` as appropriate.
6. Look for comments that indicate forced types or other code smells that would prevent a build error from being thrown where it should be thrown and check that the assertion still applies.
> If you add these, mark them with @monaco-uplift - that'll make them easier to find in the future. Better: if you can remove them, do! Typically, the cause is mixing imports from
private API and public API. Often public API fails to satisfy private declarations.
7. Test the application thoroughly - make sure everything's still working.
> It may also be necessary to update our various `vscode` dependencies to match the current state of VSCode. It may not be necessary to upgrade all (or any) of these to successfully adopt a new Monaco version, but if something is misbehaving inexplicably, checking dependencies is a reasonable place to start. Check on:
> - `vscode-debugprotocol`
> - `vscode-languageserver-protocol`
> - `vscode-oniguruma`
> - `vscode-proxy-agent`
> - `vscode-ripgrep`
> - `vscode-textmate`
> - `vscode-uri`

### Publishing for testing

Once you believe that everything is in working order, you'll need to publish the new `@theia/monaco-editor-core` for testing. The instructions for doing so are
[here](https://github.com/theia-ide/vscode/wiki/Publish-%60@theia-monaco-editor-core%60). Once the package is published, point your `package.json`s at the testing version and make
sure everything still works, then make a PR.


## Additional Information

- [API documentation for `@theia/monaco`](https://eclipse-theia.github.io/theia/docs/next/modules/monaco.html)
- [Theia - GitHub](https://github.com/eclipse-theia/theia)
- [Theia - Website](https://theia-ide.org/)

## License

- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)

## Trademark
"Theia" is a trademark of the Eclipse Foundation
https://www.eclipse.org/theia


# Theia - Monaco Extension

See [here](https://www.theia-ide.org/doc/index.html) for a detailed documentation.

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)
