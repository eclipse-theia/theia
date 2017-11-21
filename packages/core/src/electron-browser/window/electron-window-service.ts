/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { ipcRenderer } from 'electron';
import { DefaultWindowService } from '../../browser/window/window-service';

@injectable()
export class ElectronWindowService extends DefaultWindowService {

    openNewWindow(url: string): void {
        ipcRenderer.send('create-new-window', url);
    }

}
