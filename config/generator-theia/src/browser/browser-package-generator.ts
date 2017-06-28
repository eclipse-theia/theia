/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import Base = require('yeoman-generator');
import { AbstractGenerator } from './abstract-generator';

export class BrowserPackageGenerator extends AbstractGenerator {

    generate(fs: Base.MemFsEditor): void {
        fs.writeJSON('package.json', this.compilePackage());
        fs.writeJSON('tsconfig.json', this.compileTsConfig());
        fs.write('webpack.config.js', this.compileWebpackConfig());
    }

    protected compilePackage(): object {
        return {
            ...this.model.pck,
            "scripts": {
                "bootstrap": "npm install",
                "clean": "rimraf lib",
                "prepare": "npm run clean && npm run build",
                "build": "npm run build:app",
                "build:app": "npm run build:backend && npm run build:frontend",
                "build:backend": "tsc",
                "build:frontend": `webpack && cp ${this.srcGen()}/frontend/index.html lib/frontend`,
                "start": "npm run start:app",
                "start:app": "concurrently --names backend,webpack-server --prefix \"[{name}]\" \"npm run start:backend\" \"npm run start:frontend\"",
                "start:backend": "node ./lib/backend/main.js | bunyan",
                "start:backend:debug": "node ./lib/backend/main.js --loglevel=debug | bunyan",
                "start:frontend": "webpack-dev-server --open",
                "cold:start": "npm run clean && npm run build && npm start",
                "watch": "npm run watch:app",
                "watch:app": "concurrently --names watch-backend,watch-frontend --prefix \"[{name}]\" \"npm run watch:backend\"  \"npm run watch:frontend\"",
                "watch:backend": "tsc --watch",
                "watch:frontend": "npm run build:frontend && webpack --watch",
                ...this.model.pck.scripts
            },
            "devDependencies": {
                "typescript": "^2.4.1",
                "bunyan": "^1.8.10",
                "concurrently": "^3.4.0",
                "copy-webpack-plugin": "^4.0.1",
                "circular-dependency-plugin": "^2.0.0",
                "css-loader": "^0.28.1",
                "file-loader": "^0.11.1",
                "font-awesome-webpack": "0.0.5-beta.2",
                "less": "^2.7.2",
                "rimraf": "^2.6.1",
                "source-map-loader": "^0.2.1",
                "url-loader": "^0.5.8",
                "webpack": "^2.2.1",
                "webpack-dev-server": "^2.4.1",
                "webpack-merge": "^3.0.0",
                ...this.model.pck.devDependencies
            }
        }
    }

    protected compileTsConfig(): object {
        return {
            "compilerOptions": {
                "declaration": false,
                "noImplicitAny": true,
                "noEmitOnError": true,
                "noImplicitThis": true,
                "noUnusedLocals": true,
                "strictNullChecks": true,
                "experimentalDecorators": true,
                "emitDecoratorMetadata": true,
                "module": "commonjs",
                "moduleResolution": "node",
                "target": "es5",
                "outDir": "lib",
                "lib": [
                    "es6",
                    "dom"
                ],
                "sourceMap": true
            },
            "include": [
                this.srcGen()
            ]
        }
    }

    protected compileWebpackConfig(): string {
        return `${this.compileCopyright()}
module.exports = require("theia-core/config/webpack/webpack.config.web.dev")(__dirname, ${this.model.config.port}, "${this.model.config.host}");`
    }

}