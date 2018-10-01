# Theia - Java Extension

See [here](https://www.theia-ide.org/doc/index.html) for a detailed documentation.

## jdt.ls versions
Update  'jdt.ls.download.path in 'package.json' to update the jdt.ls used by the extension
remove the key to fall-back to latest jdt.ls build.

## Contribute a Java Extension
`JavaExtensionContribution` is a contribution point for all java extensions to provide paths of bundle jar files.

### Implement `JavaExtensionContribution`
1. Put your bundle together with your extension (./bundles subfolder for example);
2. Create new class which implements `JavaExtensionContribution`, 
This class should return paths to the java bundles and the paths should be absolute.
3. Don't forget to bind yor class  `bind(JavaExtensionContribution).to(MyExtension).inSingletonScope();`
Then Java Language Server will install this bundle for later usage.

## License
- [Eclipse Public License 2.0](http://www.eclipse.org/legal/epl-2.0/)
- [一 (Secondary) GNU General Public License, version 2 with the GNU Classpath Exception](https://projects.eclipse.org/license/secondary-gpl-2.0-cp)