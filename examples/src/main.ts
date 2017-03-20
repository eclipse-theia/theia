import {Container} from "inversify";
import {TheiaApplication, browserApplicationModule} from "theia/src/application/browser";
import {navigatorModule} from "theia/src/navigator/browser";
import {fileSystemClientModule} from "theia/src/filesystem/browser";
import {editorModule} from "theia/src/editor/browser";
import {electronMenuModule} from "theia/src/application/node/menu/menu-module";
import "theia/src/application/browser/style/index.css";
import "theia/src/editor/browser/style/index.css";
import "theia/src/navigator/browser/style/index.css";

// create container
let container = new Container();
container.load(browserApplicationModule);
container.load(navigatorModule);
container.load(fileSystemClientModule);
container.load(editorModule);
container.load(electronMenuModule);

// obtain application and start
const application = container.get(TheiaApplication);
application.start();
