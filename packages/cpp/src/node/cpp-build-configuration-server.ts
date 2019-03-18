/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import * as crypto from 'crypto';
import { injectable, inject, named } from 'inversify';
import { EOL, tmpdir } from 'os';
import { join } from 'path';
import { CppBuildConfigurationServer } from '../common/cpp-build-configuration-protocol';
import { FileSystem } from '@theia/filesystem/lib/common';
import { FileUri } from '@theia/core/lib/node';
import { isArray } from 'util';
import { ILogger } from '@theia/core/lib/common/logger';

@injectable()
export class CppBuildConfigurationServerImpl implements CppBuildConfigurationServer {

    @inject(ILogger) @named('cpp')
    protected readonly logger: ILogger;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    async getMergedCompilationDatabase(params: { directories: string[] }): Promise<string> {
        const directories = params.directories.sort();
        const hash = crypto.createHash('sha256');
        // tslint:disable-next-line:no-any
        const entries: any = [];

        for (const directory of directories) {
            hash.update(directory);
        }

        await Promise.all(directories.map(async directory => {
            const file = await this.fileSystem.resolveContent(
                FileUri.create(directory).resolve('compile_commands.json').toString());
            const parsed = JSON.parse(file.content);
            if (!isArray(parsed)) {
                throw new Error(`content is not a JSON array: ${file.stat.uri}`);
            }
            entries.push(...parsed);
        }));

        const databaseFolder = join(tmpdir(), 'theia-cpp-databases', hash.digest('hex').toLowerCase());
        const databasePath = FileUri.create(databaseFolder)
            .resolve('compile_commands.json').toString();

        if (await this.fileSystem.exists(databasePath)) {
            await this.fileSystem.delete(databasePath);
        }
        await this.fileSystem.createFile(databasePath, {
            content: JSON.stringify(entries) + EOL
        });
        this.logger.debug(`Wrote merged compilation database into ${databaseFolder}`);
        return databasePath;
    }
}
