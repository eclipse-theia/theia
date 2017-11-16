/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ipcRenderer } from 'electron';
import { injectable } from 'inversify';
import { DefaultWindowHelper } from '../browser/window-helper';

@injectable()
export class ElectronWindowHelper extends DefaultWindowHelper {

    reloadWindow(window: Window): void {
        window.location.reload();
    }

    openNewWindow(url: string): void {
        ipcRenderer.send('create-new-window', url);
    }

}
