/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import Base = require('yeoman-generator');
import { AbstractGenerator, sortByKey, NodePackage } from '../common';

export class ExtensionPackageGenerator extends AbstractGenerator {

    generate(fs: Base.MemFsEditor): void {
        fs.writeJSON('package.json', this.compilePackage());
        if (!fs.exists('compile.tsconfig.json')) {
            fs.writeJSON('compile.tsconfig.json', this.compileTsConfig());
        }
    }

    protected compilePackage(): object {
        const pck = this.compileCommonPackage()
        if (!this.model.extensionConfig.testSupport) {
            return pck
        }
        return {
            ...pck,
            "nyc": pck.nyc || {
                "extends": "../nyc.json"
            },
            "scripts": {
                ...pck.scripts,
                "clean": "yarn run compile:clean && yarn run test:clean",
                "test": "nyc mocha --opts ../mocha.opts src/**/*.spec.ts",
                "test:watch": "mocha -w --opts ../mocha.opts src/**/*.spec.ts",
                "test:clean": "rimraf .nyc_output && rimraf coverage",
                ...this.model.pck.scripts
            },
            "devDependencies": sortByKey({
                ...pck.devDependencies,
                "@types/chai": "^4.0.1",
                "@types/chai-as-promised": "0.0.31",
                "@types/mocha": "^2.2.41",
                "chai": "^4.1.0",
                "chai-as-promised": "^7.1.1",
                "mocha": "^3.4.2",
                "nyc": "^11.0.3",
                "ts-node": "^3.2.0",
                ...this.model.pck.devDependencies
            })
        };
    }

    protected compileCommonPackage(): NodePackage {
        return {
            ...this.model.pck,
            "license": this.model.pck.license || "Apache-2.0",
            "repository": this.model.pck.repository || {
                "type": "git",
                "url": "https://github.com/theia-ide/theia.git"
            },
            "bugs": this.model.pck.bugs || {
                "url": "https://github.com/theia-ide/theia/issues"
            },
            "homepage": this.model.pck.homepage || "https://github.com/theia-ide/theia",
            "files": this.model.pck.files || [
                "lib",
                "src"
            ],
            "scripts": {
                "clean": "yarn run compile:clean",
                "build": "concurrently -n compile,lint -c blue,green \"yarn run compile\" \"yarn run lint\"",
                "compile": "tsc -p compile.tsconfig.json",
                "compile:clean": "rimraf lib",
                "lint": "tslint -c ../tslint.json --project compile.tsconfig.json",
                "watch": "tsc -w -p compile.tsconfig.json",
                ...this.model.pck.scripts
            },
            "devDependencies": sortByKey({
                "concurrently": "^3.5.0",
                "rimraf": "^2.6.1",
                "tslint": "^5.5.0",
                "typescript": "^2.4.1",
                ...this.model.pck.devDependencies
            })
        };
    }

    protected compileTsConfig(): object {
        return {
            "extends": "../base.tsconfig",
            "compilerOptions": {
                "rootDir": "src",
                "outDir": "lib"
            },
            "include": [
                "src"
            ]
        }
    }

}