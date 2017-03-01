import {ApplicationShell} from "@theia/shell-dom";
import {Application} from "@phosphor/application";
import {FileNavigator} from "@theia/navigator-dom";
import "@theia/shell-dom/style/index.css";

const shell = new ApplicationShell();
const application = new Application<ApplicationShell>({shell});

const fileNavigator = new FileNavigator();
shell.addToLeftArea(fileNavigator);
application.started.then(() => {
    shell.activateLeft(fileNavigator.id);
});

window.onload = () => application.start();
