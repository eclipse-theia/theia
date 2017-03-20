import * as main from "../main";
import { Container } from "inversify";
import { browserMenuModule } from "theia/src/application/browser/menu/menu-module";

// Create the browser specific container.
const container = new Container();
container.load(browserMenuModule);

// Invoke common main with the browser specific bindings.
main.start(container);