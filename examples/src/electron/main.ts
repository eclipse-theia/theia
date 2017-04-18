import * as main from '../main';
import { Container } from 'inversify';
import { electronClipboardModule } from 'theia/src/application/electron-browser/clipboard/clipboard-module';
import { electronMenuModule } from 'theia/src/application/electron-browser/menu/menu-module';

// Create the electron specific container.
const container = new Container();
container.load(electronMenuModule);
container.load(electronClipboardModule);

// Invoke common main with the electron specific bindings.
main.start(container);