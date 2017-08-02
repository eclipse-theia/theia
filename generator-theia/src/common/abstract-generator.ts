/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as os from 'os';
import * as path from 'path';
import Base = require('yeoman-generator');

import { ProjectModel } from "./generator-model";

export type FileSystem = Base.MemFsEditor;

export abstract class AbstractGenerator {

    constructor(
        protected readonly model: ProjectModel
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
        return this.compileModuleImports(modules, 'require')
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
        }).map(statement => `    .then(function () { return ${statement}.then(load) })`);
        return os.EOL + lines.join(os.EOL);
    }

    protected compileCopyright(): string {
        const copyright = this.model.config.copyright;
        return copyright ? copyright + os.EOL : '';
    }

    protected node_modulesPath(): string {
        return this.model.config.node_modulesPath;
    }

    protected isWeb(): boolean {
        return this.model.target === 'web';
    }

    protected isElectron(): boolean {
        return this.model.target === 'electron-renderer';
    }

    protected ifWeb(value: string, defaultValue: string = '') {
        return this.isWeb() ? value : defaultValue;
    }

    protected ifElectron(value: string, defaultValue: string = '') {
        return this.isElectron() ? value : defaultValue;
    }

}