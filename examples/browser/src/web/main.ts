import {Container} from "inversify";
import {TheiaApplication, shellModule} from "theia/lib/application/browser";
import {navigatorModule} from "theia/lib/navigator/browser";
import {fileSystemClientModule} from "theia/lib/filesystem/browser";
import {editorModule} from "theia/lib/editor/browser";
import "theia/src/application/browser/style/index.css";
import "theia/src/editor/browser/style/index.css";
import "theia/src/navigator/browser/style/index.css";


// create container
let container = new Container();
container.load(shellModule);
container.load(navigatorModule);
container.load(fileSystemClientModule(`ws://${location.host}/fileSystem`));
container.load(editorModule);

// obtain application and start
const application = container.get(TheiaApplication);
application.start();
