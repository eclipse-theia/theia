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

    protected compileModuleImports(modules: Map<string, string>): string {
        if (modules.size === 0) {
            return '';
        }
        const lines = Array.from(modules.keys()).map(moduleName =>
            `import ${moduleName} from '${modules.get(moduleName)}';`
        );
        return os.EOL + lines.join(os.EOL);
    }

    protected compileModuleLoading(modules: Map<string, string>): string {
        if (modules.size === 0) {
            return '';
        }
        const lines = Array.from(modules.keys()).map(moduleName =>
            `container.load(${moduleName});`
        );
        return os.EOL + lines.join(os.EOL);
    }

    protected compileCopyright(): string {
        return `/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
`;
    }

}