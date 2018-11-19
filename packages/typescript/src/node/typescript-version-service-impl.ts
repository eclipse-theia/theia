/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// tslint:disable-next-line:no-implicit-dependencies
import * as fs from 'fs-extra';
import * as cp from 'child_process';
import * as commandExists from 'command-exists';
import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { isWindows, Path } from '@theia/core/lib/common';
import { FileUri } from '@theia/core/lib/node';
import { TypescriptVersion, TypescriptVersionService, TypescriptVersionOptions } from '../common/typescript-version-service';
// tslint:disable-next-line:no-implicit-dependencies
import { ApplicationPackage } from '@theia/application-package';

export namespace TypescriptVersionURI {
    const scheme = 'tsversion';
    export function encodeCommand(command: string): URI {
        return new URI().withScheme(scheme).withPath(command);
    }
    export function getTsServerPath(version: TypescriptVersion | undefined): string | undefined {
        const uri = version && version.uri && new URI(version.uri);
        if (!uri) {
            return undefined;
        }
        if (uri.scheme === scheme) {
            return uri.path.toString();
        }
        return FileUri.fsPath(uri.resolve('tsserver.js'));
    }
}

@injectable()
export class TypescriptVersionServiceImpl implements TypescriptVersionService {

    @inject(ApplicationPackage)
    protected readonly applicationPackage: ApplicationPackage;

    async getVersions(options: TypescriptVersionOptions): Promise<TypescriptVersion[]> {
        const versions: TypescriptVersion[] = [];
        const version = await this.resolveBundledVersion();
        if (version) {
            versions.push(version);
        }
        await this.resolveWorkspaceVersions(versions, options);
        return versions;
    }

    protected async resolveBundledVersion(): Promise<TypescriptVersion | undefined> {
        return await this.resolveBundledVersionInApplicationPath() ||
            await this.resolveBundledVersionWithRequire() ||
            this.resolveBundledVersionAsExecutable();
    }

    protected async resolveBundledVersionInApplicationPath(): Promise<TypescriptVersion | undefined> {
        const uri = FileUri.create(this.applicationPackage.projectPath).resolve('node_modules/typescript/lib');
        const version = await this.readVersion(uri);
        if (version) {
            return {
                uri: uri.toString(),
                version,
                qualifier: 'Bundled'
            };
        }
    }

    protected async resolveBundledVersionWithRequire(): Promise<TypescriptVersion | undefined> {
        try {
            const uri = FileUri.create(require.resolve('typescript')).parent;
            const version = await this.readVersion(uri);
            if (version) {
                return {
                    uri: uri.toString(),
                    version,
                    qualifier: 'Bundled'
                };
            }
        } catch { /* no-op */ }
    }

    protected async resolveBundledVersionAsExecutable(): Promise<TypescriptVersion | undefined> {
        const command = isWindows ? 'tsserver.cmd' : 'tsserver';
        if (!commandExists.sync(command)) {
            return undefined;
        }
        try {
            const output = cp.spawnSync(isWindows ? 'tsc.cmd' : 'tsc', ['--version']).output.filter(_ => !!_).map(_ => String(_)).join('');
            const matches = output.match(/(\d+\.\d+\.\d+)/g);
            const match = matches && matches[0];
            if (match) {
                return {
                    uri: TypescriptVersionURI.encodeCommand(command).toString(),
                    version: match,
                    qualifier: 'Bundled'
                };
            }
        } catch { /* no-op */ }
    }

    protected async resolveWorkspaceVersions(versions: TypescriptVersion[], options: TypescriptVersionOptions): Promise<void> {
        const all = new Map<string, string | undefined>();
        const workspaceFolders = options.workspaceFolders.map(uri => new URI(uri));
        if (options.localTsdk) {
            await this.resolveVersions(workspaceFolders, all, options.localTsdk);
        }
        await this.resolveVersions(workspaceFolders, all, 'node_modules/typescript/lib');
        for (const [uri, version] of all.entries()) {
            if (version) {
                versions.push({
                    uri,
                    version,
                    qualifier: 'Workspace'
                });
            }
        }
    }
    protected async resolveVersions(roots: URI[], versions: Map<string, string | undefined>, rawPath: string): Promise<void> {
        const path = new Path(rawPath);
        if (path.isAbsolute) {
            await this.resolveVersion(versions, new URI().withPath(path));
        } else {
            await Promise.all(roots.map(root =>
                this.resolveVersion(versions, root.resolve(path))
            ));
        }
    }
    protected async resolveVersion(versions: Map<string, string | undefined>, uri: URI): Promise<void> {
        const key = uri.toString();
        if (versions.has(key)) {
            return;
        }
        versions.set(key, undefined);
        try {
            const version = await this.readVersion(uri);
            versions.set(key, version);
        } catch { /*no-op*/ }
    }

    protected async readVersion(uri: URI): Promise<string | undefined> {
        try {
            const packagePath = FileUri.fsPath(uri.parent.resolve('package.json'));
            const pck: { version?: string | Object } | undefined = await fs.readJSON(packagePath);
            return pck && pck.version && typeof pck.version === 'string' ? pck.version : undefined;
        } catch { /*no-op*/ }
        return undefined;
    }

}
