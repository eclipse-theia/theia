/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { AbstractFrontendGenerator, FileSystem } from "../common";

export class ElectronFrontendGenerator extends AbstractFrontendGenerator {

    generate(fs: FileSystem): void {
        this.doGenerate(fs, this.model.frontendElectronModules);
        fs.write(this.frontend('electron-main.js'), this.compileElectronMain());
    }

    protected compileElectronMain(): string {
        return `${this.compileCopyright()}
// @ts-check
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

electron.app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        electron.app.quit();
    }
});

electron.app.on('ready', function () {
    const mainWindow = new electron.BrowserWindow({ width: 1024, height: 728 });
    require("../backend/main").then(server => {
        mainWindow.loadURL(\`file://\${path.join(__dirname, '../../lib/index.html')}?port=\${server.address().port}\`);
    }).catch(() => {
        electron.app.exit(1);
    });
    mainWindow.on('closed', function () {
        electron.app.exit(0);
    });
});`;
    }

}