import { Container } from "inversify";
import { TheiaApplication, browserApplicationModule } from "theia/lib/application/browser";
import { navigatorModule } from "theia/lib/navigator/browser";
import { fileSystemClientModule } from "theia/lib/filesystem/browser";
import { editorModule } from "theia/lib/editor/browser";
import { browserLanguagesModule } from 'theia/lib/languages/browser';
import { monacoModule } from 'theia/lib/monaco/browser';
import "theia/src/application/browser/style/index.css";
import "theia/src/editor/browser/style/index.css";
import "theia/src/navigator/browser/style/index.css";

export function start(clientContainer?: Container) {

    // Create the common client container.
    const container = new Container();
    container.load(browserApplicationModule);
    container.load(navigatorModule);
    container.load(fileSystemClientModule);
    container.load(editorModule);
    container.load(browserLanguagesModule);
    container.load(monacoModule);

    // Merge the common conatiner with the client specific one. If any.
    const mainContainer = clientContainer ? Container.merge(container, clientContainer) : container;

    // Obtain application and start.
    const application = mainContainer.get(TheiaApplication);
    application.start(mainContainer);
}