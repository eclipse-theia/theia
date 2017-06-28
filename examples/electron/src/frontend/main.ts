/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container } from 'inversify';
import { FrontendApplication, frontendApplicationModule } from 'theia-core/lib/application/browser';
import { messagingFrontendModule } from 'theia-core/lib/messaging/browser';
import { loggerFrontendModule } from 'theia-core/lib/application/browser';

import electronMenuModule from 'theia-core/lib/application/electron-browser/menu/electron-menu-module';
import electronClipboardModule from 'theia-core/lib/application/electron-browser/clipboard/electron-clipboard-module';
import fileSystemFrontendModule from 'theia-core/lib/filesystem/browser/filesystem-frontend-module';
import workspaceFrontendModule from 'theia-core/lib/workspace/browser/workspace-frontend-module';
import navigatorFrontendModule from 'theia-core/lib/navigator/browser/navigator-frontend-module';
import editorFrontendModule from 'theia-core/lib/editor/browser/editor-frontend-module';
import monacoFrontendModule from 'theia-core/lib/monaco/browser/monaco-frontend-module';
import terminalFrontendModule from 'theia-core/lib/terminal/browser/terminal-frontend-module';
import languagesFrontendModule from 'theia-core/lib/languages/browser/languages-frontend-module';
import javaFrontendModule from 'theia-core/lib/java/browser/java-frontend-module';
import pythonFrontendModule from 'theia-core/lib/python/browser/python-frontend-module';
import cppFrontendModule from 'theia-core/lib/cpp/browser/cpp-frontend-module';

const container = new Container();
container.load(frontendApplicationModule);
container.load(messagingFrontendModule);
container.load(loggerFrontendModule);

container.load(electronMenuModule);
container.load(electronClipboardModule);
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

const application = container.get(FrontendApplication);
application.start();