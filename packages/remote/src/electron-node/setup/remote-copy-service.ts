// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import * as archiver from 'archiver';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as http from 'http';
import { ApplicationPackage } from '@theia/core/shared/@theia/application-package';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { RemoteConnection, RemotePlatform } from '../remote-types';
import { RemoteNativeDependencyService } from './remote-native-dependency-service';
import { ContributionProvider } from '@theia/core';
import { RemoteCopyContribution, RemoteCopyRegistry, RemoteFile } from './remote-copy-contribution';
import { RemoteSetupScriptService } from './remote-setup-script-service';
import { launchNodeHttpCopyServer } from './http-copy-server';

@injectable()
export class RemoteCopyService {

    @inject(ApplicationPackage)
    protected readonly applicationPackage: ApplicationPackage;

    @inject(RemoteCopyRegistry)
    protected readonly copyRegistry: RemoteCopyRegistry;

    @inject(RemoteNativeDependencyService)
    protected readonly nativeDependencyService: RemoteNativeDependencyService;

    @inject(RemoteSetupScriptService)
    protected readonly scriptService: RemoteSetupScriptService;

    @inject(ContributionProvider) @named(RemoteCopyContribution)
    protected readonly copyContributions: ContributionProvider<RemoteCopyContribution>;

    protected initialized = false;

    async copyToRemote(remote: RemoteConnection, remotePlatform: RemotePlatform, destination: string, nodeExecutable: string, remoteHttpCopyPort?: number): Promise<void> {
        const zipName = path.basename(destination);
        const projectPath = this.applicationPackage.projectPath;
        const tempDir = await this.getTempDir();
        const zipPath = path.join(tempDir, zipName);
        const files = await this.getFiles(remotePlatform, tempDir);
        // We stream to a file here and then copy it because it is faster
        // Copying files via sftp is 4x times faster compared to readable streams
        const stream = fs.createWriteStream(zipPath);
        const archive = archiver('tar', {
            gzip: true
        });
        archive.pipe(stream);
        for (const file of files) {
            const filePath = path.isAbsolute(file.path)
                ? file.path
                : path.join(projectPath, file.path);

            archive.file(filePath, {
                name: file.target,
                mode: file.options?.mode
            });
        }
        await archive.finalize();

        const copyMethodOrder = [this.httpCopy, this.sftpCopy];
        for (const copyMethod of copyMethodOrder) {
            try {
                await copyMethod.call(this, zipPath, destination, remote, remotePlatform, nodeExecutable, remoteHttpCopyPort);
                break;
            } catch (error) {
                console.warn(`Failed to ${copyMethod.name} application to remote system: ${error.message}`);
                if (copyMethod === copyMethodOrder[copyMethodOrder.length - 1]) {
                    throw new Error('could not find a working way to copy backend to remote system');
                }
            }
        }

        await fs.promises.rm(tempDir, {
            recursive: true,
            force: true
        });
    }

    protected async sftpCopy(zipPath: string, destination: string, remote: RemoteConnection): Promise<void> {
        await remote.copy(zipPath, destination);
    }

    protected async httpCopy(zipPath: string, destination: string,
        remote: RemoteConnection, remotePlatform: RemotePlatform,
        nodeExecutable: string, remoteHttpCopyPort?: number): Promise<void> {
        const httpServerScript = Buffer.from(`
            const __require = require;
            ${launchNodeHttpCopyServer}
            launchNodeHttpCopyServer('${destination}', ${remoteHttpCopyPort ?? 8080})`, 'utf-8'
        );
        const serverScriptLocation = (await remote.exec(this.scriptService.tempFile(remotePlatform))).stdout.trim();
        await remote.copy(httpServerScript, serverScriptLocation); // TODO get remote tempPath
        const serverProcess = await remote.execPartial(`${nodeExecutable} ${serverScriptLocation}`, stdout => stdout.includes('Port:'));
        if (serverProcess.stderr.includes('Error')) {
            throw new Error('error launching http server on target system: ' + serverProcess.stderr);
        }
        const port = Number(serverProcess.stdout.trim().split(':')[1]);

        return new Promise((res, rej) => {
            try {
                const zipStat = fs.statSync(zipPath);
                const request = http.request(`http://${remote.name}:${port}`, { method: 'POST', headers: { 'Content-Length': zipStat.size } }, response => {
                    if (response.statusCode !== 200) {
                        rej(new Error('http server returned status code ' + response.statusCode));
                    } else {
                        res();
                    }
                });
                fs.createReadStream(zipPath).pipe(request);
            } catch (err) {
                rej(err);
            }
        });
    }

    protected async getFiles(remotePlatform: RemotePlatform, tempDir: string): Promise<RemoteFile[]> {
        const [localFiles, nativeDependencies] = await Promise.all([
            this.loadCopyContributions(),
            this.loadNativeDependencies(remotePlatform, tempDir)
        ]);
        return [...localFiles, ...nativeDependencies];
    }

    protected async loadCopyContributions(): Promise<RemoteFile[]> {
        if (this.initialized) {
            return this.copyRegistry.getFiles();
        }
        await Promise.all(this.copyContributions.getContributions()
            .map(copyContribution => copyContribution.copy(this.copyRegistry)));
        this.initialized = true;
        return this.copyRegistry.getFiles();
    }

    protected async loadNativeDependencies(remotePlatform: RemotePlatform, tempDir: string): Promise<RemoteFile[]> {
        const dependencyFiles = await this.nativeDependencyService.downloadDependencies(remotePlatform, tempDir);
        return dependencyFiles.map(file => ({
            path: file.path,
            target: file.target,
            options: {
                mode: file.mode
            }
        }));
    }

    protected async getTempDir(): Promise<string> {
        const dir = path.join(os.tmpdir(), 'theia-remote-');
        const tempDir = await fs.promises.mkdtemp(dir);
        return tempDir;
    }

    protected async getRemoteDownloadLocation(): Promise<string | undefined> {
        return undefined;
    }
}
