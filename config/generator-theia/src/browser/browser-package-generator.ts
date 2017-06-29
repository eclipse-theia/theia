/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import Base = require('yeoman-generator');
import { AbstractGenerator, sortByKey } from '../common';

export class BrowserPackageGenerator extends AbstractGenerator {

    generate(fs: Base.MemFsEditor): void {
        fs.writeJSON('package.json', this.compilePackage());
        fs.write('webpack.config.js', this.compileWebpackConfig());
    }

    protected compilePackage(): object {
        return {
            ...this.model.pck,
            "dependencies": sortByKey({
                ...this.model.pck.dependencies
            }),
            "scripts": sortByKey({
                ...this.commonScripts('web'),
                "start": "concurrently --names backend,webpack-server --prefix \"[{name}]\" \"npm run start:backend\" \"npm run start:frontend\"",
                "start:backend": "node ./src-gen/backend/main.js | bunyan",
                "start:backend:debug": "node ./src-gen/backend/main.js --loglevel=debug | bunyan",
                "start:frontend": "webpack-dev-server --open",
                ...this.model.pck.scripts
            }),
            "devDependencies": sortByKey({
                ...this.commonDevDependencies,
                "webpack-dev-server": "^2.5.0",
                ...this.model.pck.devDependencies
            })
        }
    }

    protected compileWebpackConfig(): string {
        return `${this.compileCopyright()}
module.exports = require("theia-core/config/webpack/webpack.config.web.dev")(__dirname, ${this.model.config.port}, "${this.model.config.host}");`
    }

}