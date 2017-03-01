import {ApplicationShell} from "@theia/shell-dom";
import {Application} from "@phosphor/application";

const shell = new ApplicationShell();
const application = new Application<ApplicationShell>({shell});
window.onload = () => application.start();
