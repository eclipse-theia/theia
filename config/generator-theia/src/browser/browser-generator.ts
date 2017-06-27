/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as paths from 'path';
import * as process from 'process';
import BaseGenerator = require('yeoman-generator');

import { Model } from "./generator-model";
import { BrowserBackendGenerator } from "./browser-backend-generator";

export class TheiaBrowserGenerator extends BaseGenerator {

    protected readonly model = new Model();
    protected readonly backend = new BrowserBackendGenerator(this.model);

    initializing(): void {
        this.config.defaults({
            extensions: {},
            localExtensions: {}
        });
        this.model.config = {
            name: this.appname.replace(/\s+/g, '-'),
            extensions: this.config.get('extensions'),
            localExtensions: this.config.get('localExtensions')
        };
    }

    configuring(): void {
        this.config.save();
        this.model.readLocalExtensionPackages((extension, path) => {
            const extensionPath = paths.join(process.cwd(), `${path}/package.json`);
            console.log(extensionPath);
            return this.fs.readJSON(extensionPath, undefined);
        })
        this.model.readExtensionPackages((extension, version) => {
            return this.spawnCommandSync('npm', ['view', `${extension}@${version}`, '--json']);
        });
    }

    writing(): void {
        this.fs.writeJSON('package.json', {
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
        });
        this.fs.write('src/backend/main.ts', this.backend.generate());
    }

    install(): void {
        this.spawnCommandSync('npm', ['run', 'localinstall']);
    }

}