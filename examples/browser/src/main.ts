import {Container} from "inversify";
import {TheiaApplication, shellModule} from "@theia/application-browser";
import {navigatorModule} from "@theia/navigator-browser";
import {FileSystem, Path, inmemoryModule} from "@theia/filesystem-common";
import {editorModule} from "@theia/editor-browser";
import "@theia/application-browser/style/index.css";
import "@theia/editor-browser/style/index.css";
import "@theia/navigator-browser/style/index.css";

// create container
let container = new Container();
container.load(shellModule);
container.load(navigatorModule);
container.load(inmemoryModule);
container.load(editorModule);

// obtain application and start
const application = container.get(TheiaApplication);
application.start();

const fileSystem = container.get<FileSystem>(FileSystem);

let index = 0;
let level = 0;
const dirName = 'foo';
let dirPath = dirName;
setInterval(() => {
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