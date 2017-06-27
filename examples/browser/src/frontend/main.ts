/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container } from "inversify";
import { FrontendApplication, frontendApplicationModule } from "theia-core/lib/application/browser";
import { messagingFrontendModule } from "theia-core/lib/messaging/browser";
import { loggerFrontendModule } from "theia-core/lib/application/browser";

import { browserMenuModule } from "theia-core/lib/application/browser/menu";
import { browserClipboardModule } from "theia-core/lib/application/browser/clipboard";

import { fileSystemFrontendModule } from "theia-core/lib/filesystem/browser";
import { workspaceFrontendModule } from "theia-core/lib/workspace/browser";
import { navigatorFrontendModule } from "theia-core/lib/navigator/browser";
import { editorFrontendModule } from "theia-core/lib/editor/browser";
import { monacoFrontendModule } from "theia-core/lib/monaco/browser";
import { terminalFrontendModule } from "theia-core/lib/terminal/browser";
import { languagesFrontendModule } from "theia-core/lib/languages/browser";
import { javaFrontendModule } from "theia-core/lib/java/browser";
import { pythonFrontendModule } from "theia-core/lib/python/browser";
import { cppFrontendModule } from "theia-core/lib/cpp/browser";

import "theia-core/src/application/browser/style/index.css";
import "font-awesome/css/font-awesome.min.css";

import "theia-core/src/filesystem/browser/style/index.css";
import "theia-core/src/monaco/browser/style/index.css";
import "theia-core/src/terminal/browser/terminal.css";
import "xterm/dist/xterm.css";
import "theia-core/lib/java/browser/monaco-contribution";

// Create the client container and load the common contributions.
const container = new Container();
container.load(frontendApplicationModule);
container.load(messagingFrontendModule);
container.load(loggerFrontendModule);

// Load the browser contributions.
container.load(browserMenuModule);
container.load(browserClipboardModule);

// Load the frontend contributions.
container.load(fileSystemFrontendModule);
container.load(workspaceFrontendModule);
container.load(navigatorFrontendModule);
container.load(editorFrontendModule);
container.load(monacoFrontendModule);
container.load(terminalFrontendModule);
container.load(languagesFrontendModule);
container.load(javaFrontendModule);
container.load(pythonFrontendModule);
container.load(cppFrontendModule);

// Obtain the application and start.
const application = container.get(FrontendApplication);
application.start();