/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import Base = require('yeoman-generator');
import { AbstractGenerator, sortByKey } from '../common';

export class ElectronPackageGenerator extends AbstractGenerator {

    generate(fs: Base.MemFsEditor): void {
        fs.writeJSON('package.json', this.compilePackage());
        fs.write('webpack.config.js', this.compileWebpackConfig());
    }

    protected compilePackage(): object {
        return {
            ...this.model.pck,
            "dependencies": sortByKey({
                "electron": "1.6.8",
                ...this.model.pck.dependencies
            }),
            "scripts": sortByKey({
                ...this.commonScripts('electron'),
                "postinstall": "electron-rebuild",
                "start": "electron ./src-gen/frontend/electron-main.js | bunyan",
                "start:debug": "electron ./src-gen/frontend/electron-main.js --loglevel=debug | bunyan",
                ...this.model.pck.scripts
            }),
            "devDependencies": sortByKey({
                ...this.commonDevDependencies,
                "electron-rebuild": "^1.5.11",
                ...this.model.pck.devDependencies
            })
        }
    }

    protected compileWebpackConfig(): string {
        return `${this.compileCopyright()}
module.exports = require("theia-core/config/webpack/webpack.config.electron.dev")(__dirname);`
    }

}