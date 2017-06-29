/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as os from 'os';
import * as path from 'path';
import Base = require('yeoman-generator');

import { Model } from "./generator-model";

export type FileSystem = Base.MemFsEditor;

export abstract class AbstractGenerator {

    constructor(
        protected readonly model: Model
    ) { }

    abstract generate(fs: FileSystem): void;

    protected srcGen(...paths: string[]): string {
        return path.join('src-gen', ...paths);
    }

    protected backend(...paths: string[]): string {
        return this.srcGen('backend', ...paths);
    }

    protected frontend(...paths: string[]): string {
        return this.srcGen('frontend', ...paths);
    }

    protected compileFrontendModuleImports(modules: Map<string, string>): string {
        return this.compileModuleImports(modules, 'import')
    }

    protected compileBackendModuleImports(modules: Map<string, string>): string {
        return this.compileModuleImports(modules, 'require')
    }

    protected compileModuleImports(modules: Map<string, string>, fn: 'import' | 'require'): string {
        if (modules.size === 0) {
            return '';
        }
        const lines = Array.from(modules.keys()).map(moduleName => {
            const invocation = `${fn}('${modules.get(moduleName)}')`;
            if (fn === 'require') {
                return `Promise.resolve(${invocation})`;
            }
            return invocation;
        }).map(statement => `.then(function () { return ${statement}.then(load) })`);
        return os.EOL + lines.join(os.EOL);
    }

    protected compileCopyright(): string {
        const copyright = this.model.config.copyright;
        return copyright ? copyright + os.EOL : '';
    }

    protected commonScripts(target: 'electron' | 'web'): { [name: string]: string } {
        return {
            "bootstrap": "npm install",
            "clean": "rimraf lib",
            "prepare": "npm run clean && npm run build",
            "cold:start": "npm run clean && npm run build && npm start",
            "build": "run build:frontend",
            "build:frontend": `webpack --target ${target} && cp ${this.srcGen()}/frontend/index.html lib`,
            "watch": "npm run watch:frontend",
            "watch:frontend": `npm run build:frontend && webpack --target ${target} --watch`,
        }
    }

    protected get commonDevDependencies(): { [name: string]: string } {
        return {
            "rimraf": "^2.6.1",
            "concurrently": "^3.4.0",
            "bunyan": "^1.8.10",
            "webpack": "^2.2.1",
            "webpack-merge": "^4.1.0",
            "copy-webpack-plugin": "^4.0.1",
            "circular-dependency-plugin": "^2.0.0",
            "css-loader": "^0.28.1",
            "file-loader": "^0.11.1",
            "source-map-loader": "^0.2.1",
            "url-loader": "^0.5.8",
            "font-awesome-webpack": "0.0.5-beta.2",
            "less": "^2.7.2"
        }
    }

}