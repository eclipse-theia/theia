import { Container } from "inversify";

import * as main from '../main';
import { browserClipboardModule } from 'theia/src/application/browser/clipboard/clipboard-module';
import { browserMenuModule } from "theia/src/application/browser/menu/menu-module";

// Create the browser specific container.
const container = new Container();
container.load(browserMenuModule);
container.load(browserClipboardModule);

// Invoke common main with the browser specific bindings.
main.start(container);