import {Container} from "inversify";
import {TheiaApplication, browserApplicationModule} from "theia/lib/application/browser";
import {navigatorModule} from "theia/lib/navigator/browser";
import {fileSystemClientModule} from "theia/lib/filesystem/browser";
import {editorModule} from "theia/lib/editor/browser";
import "theia/src/application/browser/style/index.css";
import "theia/src/editor/browser/style/index.css";
import "theia/src/navigator/browser/style/index.css";
import {browserMenuModule} from "theia/lib/application/browser/menu/menu-module";


// create container
let container = new Container();
container.load(browserApplicationModule);
container.load(navigatorModule);
container.load(fileSystemClientModule);
container.load(editorModule);
container.load(browserMenuModule);

// obtain application and start
const application = container.get(TheiaApplication);
application.start();
