import * as main from "../main";
import { Container } from "inversify";
import { electronMenuModule } from "theia/src/application/node/menu/menu-module";

// Create the electron specific container.
const container = new Container();
container.load(electronMenuModule);

// Invoke common main with the electorn specific bindings.
main.start(container);