import {ApplicationShell} from "@theia/shell-dom";
import {Application} from "@phosphor/application";
import {FileNavigator, FileNavigatorModel} from "@theia/navigator-dom";
import "@theia/shell-dom/style/index.css";
import {Path} from "@theia/fs-common";
import {InMemoryFileSystem} from "@theia/fs-common/lib/inmemory";

const shell = new ApplicationShell();
const application = new Application<ApplicationShell>({shell});

const fileSystem = new InMemoryFileSystem();
fileSystem.writeFile(Path.fromString("foo/Foo.txt"), 'Hello World');
fileSystem.writeFile(Path.fromString("bar/Bar.txt"), 'Hello World');
fileSystem.writeFile(Path.fromString("bar/Baz.txt"), 'Hello World');
const fileNavigator = new FileNavigator(new FileNavigatorModel(fileSystem));
fileNavigator.getModel().refresh();
shell.addToLeftArea(fileNavigator);
application.started.then(() => {
    shell.activateLeft(fileNavigator.id);
});

window.onload = () => application.start();
