/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as electron from 'electron';
import * as path from 'path';

let mainWindow: Electron.BrowserWindow | undefined = undefined;

electron.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron.app.quit();
    }
});

electron.app.on('ready', () => {
    require("../app"); // start the express server
    mainWindow = new electron.BrowserWindow({ width: 1024, height: 728 });
    mainWindow.webContents.openDevTools();
    mainWindow.loadURL(`file://${path.join(__dirname, 'index.html')}`);
    mainWindow.on('closed', () => {
        mainWindow = undefined;
    });
});