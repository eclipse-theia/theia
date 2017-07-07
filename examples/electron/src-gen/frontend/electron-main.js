/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// Workaround for https://github.com/electron/electron/issues/9225. Chrome has an issue where
// in certain locales (e.g. PL), image metrics are wrongly computed. We explicitly set the
// LC_NUMERIC to prevent this from happening (selects the numeric formatting category of the
// C locale, http://en.cppreference.com/w/cpp/locale/LC_categories).
if (process.env.LC_ALL) {
    process.env.LC_ALL = 'C';
}
process.env.LC_NUMERIC = 'C';

const electron = require('electron');
const path = require('path');
const backend = require("../backend/main")

let mainWindow = undefined;
var requireValue;


electron.app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        electron.app.quit();
    }
});

function loadURL() {
    backend.default.then(server => {
        mainWindow.loadURL(`file://${path.join(__dirname, '../../lib/index.html')}?port=` + server.address().port);
    });

}


electron.app.on('ready', function () {

    mainWindow = new electron.BrowserWindow({ width: 1024, height: 728 });
    mainWindow.webContents.openDevTools();
    loadURL();
    mainWindow.on('closed', function () {
        mainWindow = undefined;
    });
});