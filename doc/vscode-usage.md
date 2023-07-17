## Using code from VS Code

Since its inception, Theia has used the "Monaco" editor component from VS Code. With the recent move to using ECMAScript modules, consuming code from the VS Code project has become much easier and safer. But while reusing code saves us work, there is also a downside to it. Monaco has a relatively stable external API because Microsoft also releases it as a stand-alone editor component. But other parts of the code base may change more frequently and in unexpected ways. We always use the same version of all modules making up VS Code. So when we update VS Code, often to provide a new feature in Monaco to our adopters, we will have to deal with all the API changes at that same time. As an example: Theia used the quick-input component from VS Code directly to implement it's own quick-input component. Because the component was not encapsulated in any way, the updating Monaco to a new version became difficult and time-consuming. 

So while we don't  prohibit the use of code from VS Code (other than the Monaco editor API), we have the following goals:

* Updating Monaco should not impact adopters

* Adoption of a new Monaco version should generally be a straightforward, quick process (< 1 week of work)

In order to achieve those goals, follow these simple rules:

* Never export a type, function or variable from an internal VS Code API from a theia package

* Don't use code from VS Code that you could not easily copy into the Theia codebase if the need arises. 

The first rule shields our adopters from having to change their code in response to updating Monaco. If they cannot see an object or type, they cannot rely on its existence or API. Note that this includes functions, supertype relationships or parameter and return types. If you need to export functionality, export an interface in Theia and import that interface using imported code from VS Code. This way, we can build adapters to shield against API changes. The rule also prevents spreading dependencies on VS Code in our code without our being aware of them.  While it's not technically possible to enforce non-export of stuff in our current build system, we should make sure we're not exporting tainted code through `index.ts` or similar mechanisms. At the very least, we should not require package users to rely on VS Code stuff.

The second rule  ensures that we do not rely on VS Code stuff that is deeply coupled with other parts of VS Code that we don't want to import. It gives us the escape hatch of just copying the old version of the code and filing a CQ with the Eclipse foundation if updating to the version of stuff from VS Code is not what we want (because it doesn't fit our needs or takes to long).

Tip: you can find locations where VS code is used by searching for import statements from `@theia/monaco-editor-core/esm/vs`.


