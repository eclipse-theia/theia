/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container } from "inversify";
import { FrontendApplication, browserApplicationModule } from "theia-core/lib/application/browser";
import { messagingModule } from "theia-core/lib/messaging/browser";
import { navigatorModule } from "theia-core/lib/navigator/browser";
import { fileSystemClientModule } from "theia-core/lib/filesystem/browser";
import { editorModule } from "theia-core/lib/editor/browser";
import { frontendLanguagesModule } from 'theia-core/lib/languages/browser';
import { monacoModule } from 'theia-core/lib/monaco/browser';
import { browserClipboardModule } from 'theia-core/lib/application/browser/clipboard/clipboard-module';
import { browserMenuModule } from "theia-core/lib/application/browser/menu/menu-module";
import { loggerFrontendModule } from 'theia-core/lib/application/browser/logger-frontend-module';
import "theia-core/src/application/browser/style/index.css";
import "theia-core/src/monaco/browser/style/index.css";
import "theia-core/src/navigator/browser/style/index.css";
import "theia-core/src/terminal/browser/terminal.css";

// terminal extension
import terminalFrontendModule from 'theia-core/lib/terminal/browser/terminal-frontend-module';
import "xterm/dist/xterm.css";

// java extension
import { frontendJavaModule } from 'theia-core/lib/java/browser';
import 'theia-core/lib/java/browser/monaco-contribution';

// python extension
import { frontendPythonModule } from 'theia-core/lib/python/browser';

// cpp extension
import { frontendCppModule } from 'theia-core/lib/cpp/browser';

(() => {

    // Create the client container and load the common contributions.
    const container = new Container();
    container.load(browserApplicationModule);
    container.load(messagingModule);
    container.load(loggerFrontendModule);
    container.load(navigatorModule);
    container.load(fileSystemClientModule);
    container.load(editorModule);
    container.load(frontendLanguagesModule);
    container.load(monacoModule);
    container.load(frontendJavaModule);
    container.load(frontendPythonModule);
    container.load(frontendCppModule);

    // Load the browser specific contributions.
    container.load(browserMenuModule);
    container.load(browserClipboardModule);

    // terminal extension
    container.load(terminalFrontendModule);

    // Obtain application and start.
    const application = container.get(FrontendApplication);
    application.start();

})();