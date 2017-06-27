/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import Base = require('yeoman-generator');
import { Model } from "./generator-model";

export class BrowserPackageGenerator {

    constructor(
        protected readonly model: Model
    ) { }

    generate(fs: Base.MemFsEditor): void {
        fs.writeJSON('package.json', this.compilePackage());
    }

    protected compilePackage(): object {
        return {
            "private": true,
            "name": this.model.config.name,
            "scripts": {
                "localinstall": "ldm install --original-sources",
                "clean": "rimraf lib",
                "prepare": "npm run clean && npm run build",
                "build": "npm run build:localdeps && npm run build:backend && npm run build:frontend",
                "build:backend": "tsc",
                "build:frontend": "webpack && cp src/frontend/index.html lib/frontend",
                "build:localdeps": "ldm run build && ldm sync --original-sources",
                "start": "concurrently --names backend,webpack-server --prefix \"[{name}]\" \"npm run start:backend\" \"npm run start:frontend\"",
                "start:backend": "node ./lib/backend/main.js | bunyan",
                "start:backend:debug": "node ./lib/backend/main.js --loglevel=debug | bunyan",
                "start:frontend": "webpack-dev-server --open",
                "cold:start": "npm run clean && npm run build && npm start",
                "watch": "concurrently --names watch-deps,watch-backend,watch-frontend --prefix \"[{name}]\" \"npm run watch:localdeps\" \"npm run watch:backend\"  \"npm run watch:frontend\"",
                "watch:backend": "tsc --watch",
                "watch:frontend": "npm run build:frontend && webpack --watch",
                "watch:localdeps": "ldm watch --sync --run=watch --original-sources",
            },
            "dependencies": {
                "reflect-metadata": "^0.1.10",
                "yargs": "^8.0.1",
                ...this.model.config.extensions
            },
            "localDependencies": {
                ...this.model.config.localExtensions
            },
            "devDependencies": {
                "@types/yargs": "^6.6.0",
                "bunyan": "^1.8.10",
                "concurrently": "^3.4.0",
                "css-loader": "^0.28.1",
                "file-loader": "^0.11.1",
                "font-awesome-webpack": "0.0.5-beta.2",
                "less": "^2.7.2",
                "rimraf": "^2.6.1",
                "source-map-loader": "^0.2.1",
                "ts-loader": "^2.0.3",
                "ts-node": "^3.0.2",
                "typescript": "^2.3.4",
                "url-loader": "^0.5.8",
                "webpack": "^2.2.1",
                "webpack-dev-server": "^2.4.1"
            }
        }
    }

}