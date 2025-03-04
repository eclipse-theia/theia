// *****************************************************************************
// Copyright (C) 2024 Typefox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { WorkspaceServer } from '@theia/workspace/lib/common';
import { DevContainerFile } from '../electron-common/remote-container-connection-provider';
import { DevContainerConfiguration } from './devcontainer-file';
import { parse } from 'jsonc-parser';
import * as fs from '@theia/core/shared/fs-extra';
import { ContributionProvider, Path, URI } from '@theia/core';
import { VariableResolverContribution } from './devcontainer-contributions/variable-resolver-contribution';

const VARIABLE_REGEX = /^\$\{(.+?)(?::(.+))?\}$/;

@injectable()
export class DevContainerFileService {

    @inject(WorkspaceServer)
    protected readonly workspaceServer: WorkspaceServer;

    @inject(ContributionProvider) @named(VariableResolverContribution)
    protected readonly variableResolverContributions: ContributionProvider<VariableResolverContribution>;

    protected resolveVariable(value: string): string {
        const match = value.match(VARIABLE_REGEX);
        if (match) {
            const [, type, variable] = match;
            for (const contribution of this.variableResolverContributions.getContributions()) {
                if (contribution.canResolve(type)) {
                    return contribution.resolve(variable ?? type);
                }
            }
        }
        return value;
    }

    protected resolveVariablesRecursively<T>(obj: T): T {
        if (typeof obj === 'string') {
            return this.resolveVariable(obj) as T;
        } else if (Array.isArray(obj)) {
            return obj.map(item => this.resolveVariablesRecursively(item)) as T;
        } else if (obj && typeof obj === 'object') {
            const newObj: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(obj)) {
                newObj[key] = this.resolveVariablesRecursively(value);
            }
            return newObj as T;
        }
        return obj;
    }

    async getConfiguration(path: string): Promise<DevContainerConfiguration> {
        let configuration: DevContainerConfiguration = parse(await fs.readFile(path, 'utf-8').catch(() => '0')) as DevContainerConfiguration;
        if (!configuration) {
            throw new Error(`devcontainer file ${path} could not be parsed`);
        }

        configuration = this.resolveVariablesRecursively(configuration);
        configuration.location = path;
        return configuration;
    }

    async getAvailableFiles(workspace: string): Promise<DevContainerFile[]> {
        const devcontainerPath = new URI(workspace).path.join('.devcontainer').fsPath();

        return (await this.searchForDevontainerJsonFiles(devcontainerPath, 1)).map(file => ({
            name: parse(fs.readFileSync(file, 'utf-8')).name ?? 'devcontainer',
            path: file
        }));

    }

    protected async searchForDevontainerJsonFiles(directory: string, depth: number): Promise<string[]> {
        if (depth < 0 || !await fs.pathExists(directory)) {
            return [];
        }
        const filesPaths = (await fs.readdir(directory)).map(file => new Path(directory).join(file).fsPath());

        const devcontainerFiles = [];
        for (const file of filesPaths) {
            if (file.endsWith('devcontainer.json')) {
                devcontainerFiles.push(file);
            } else if ((await fs.stat(file)).isDirectory()) {
                devcontainerFiles.push(...await this.searchForDevontainerJsonFiles(file, depth - 1));
            }
        }
        return devcontainerFiles;
    }
}
