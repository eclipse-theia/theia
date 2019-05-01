// @ts-check
/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

const electron = require('electron');

const timeout = 60000;
const headless = process.argv.some(arg => arg === '--headless');

let exitCode = undefined;

/**
 * `code > 0` means failure.
 */
function exit(code, message) {
    if (typeof exitCode !== 'undefined') return;
    if (message) console.error('Error:', message);
    electron.app.exit(exitCode = code);
}

electron.app.on('ready', () => {
    const win = new electron.BrowserWindow({
        show: !headless,
        webPreferences: {
            nodeIntegration: true,
        }
    });
    win.loadURL(`file://${require.resolve('./index.html')}`);

    electron.ipcMain
        // we expect the codecs to be missing.
        .on('error', () => exit(0))
        .on('success', () => exit(1, 'a h264 video can play'));

    win.webContents.on('dom-ready', () => {
        setTimeout(() => exit(2, 'timeout'), timeout);
    });
    win.on('closed', () => exit(3, 'aborted'));
});
