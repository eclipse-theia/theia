/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as main from '../main';
import { Container } from 'inversify';
import { electronClipboardModule } from 'theia/lib/application/electron-browser/clipboard/clipboard-module';
import { electronMenuModule } from 'theia/lib/application/electron-browser/menu/menu-module';

// Create the electron specific container.
const container = new Container();
container.load(electronMenuModule);
container.load(electronClipboardModule);

// Invoke common main with the electron specific bindings.
main.start(container);