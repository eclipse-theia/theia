/*<<<<<<< HEAD
import {ApplicationShell} from "@theia/shell-dom";
import {Application} from "@phosphor/application";
import {FileNavigator, FileNavigatorModel} from "@theia/navigator-dom";
import {Path} from "@theia/fs-common";
import {InMemoryFileSystem} from "@theia/fs-common/lib/inmemory";

import "@theia/shell-dom/style/index.css";
import "@theia/navigator-dom/style/index.css";

const shell = new ApplicationShell();
const application = new Application<ApplicationShell>({shell});

const fileSystem = new InMemoryFileSystem();
fileSystem.writeFile(Path.fromString("foo/Foo.txt"), 'Hello World');
fileSystem.writeFile(Path.fromString("bar/Bar.txt"), 'Hello World');
fileSystem.writeFile(Path.fromString("bar/Baz.txt"), 'Hello World');
const fileNavigator = new FileNavigator(new FileNavigatorModel(fileSystem));
shell.addToLeftArea(fileNavigator);
application.started.then(() => {
    shell.activateLeft(fileNavigator.id);
});

let index = 0;
let level = 0;
const dirName = 'foo';
let dirPath = dirName;
window.setInterval(() => {
    fileSystem.writeFile(Path.fromString(`${dirPath}/Foo_${index}.txt`), 'Hello World');
    index++;
    if (index === 10) {
        index = 0;
        level++;
        dirPath += `/${dirName}`;
    }
    if (level === 4) {
        level = 0;
        dirPath = dirName;
        fileSystem.rmdir(Path.fromString(dirPath));
    }
}, 500);

=======*/

import {TheiaApplication, shellModule} from "@theia/shell-dom";
import {navigatorModule} from "@theia/navigator-dom";
import {inmemoryModule} from "@theia/fs-common";
import {Container} from "inversify";
import "@theia/shell-dom/style/index.css";

// create container
let container = new Container();
container.load(shellModule);
container.load(navigatorModule);
container.load(inmemoryModule);

// obtain application and start
const application = container.get(TheiaApplication);

window.onload = () => application.start();
