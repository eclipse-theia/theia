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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { RemoteConnection, RemoteExecResult, RemoteStatusReport } from '../remote-types';
import { RemoteCliContext, RemoteCliContribution, RemotePlatform } from '@theia/core/lib/node/remote/remote-cli-contribution';
import { ApplicationPackage } from '@theia/core/shared/@theia/application-package';
import { RemoteCopyService } from './remote-copy-service';
import { RemoteNativeDependencyService } from './remote-native-dependency-service';
import { ContributionProvider, OS, THEIA_VERSION } from '@theia/core';
import { RemoteNodeSetupService } from './remote-node-setup-service';
import { RemoteSetupScriptService } from './remote-setup-script-service';

export interface RemoteSetupOptions {
    connection: RemoteConnection;
    report: RemoteStatusReport;
    nodeDownloadTemplate?: string;
}

export interface RemoteSetupResult {
    applicationDirectory: string;
    nodeDirectory: string;
}

@injectable()
export class RemoteSetupService {

    @inject(RemoteCopyService)
    protected readonly copyService: RemoteCopyService;

    @inject(RemoteNativeDependencyService)
    protected readonly nativeDependencyService: RemoteNativeDependencyService;

    @inject(RemoteNodeSetupService)
    protected readonly nodeSetupService: RemoteNodeSetupService;

    @inject(RemoteSetupScriptService)
    protected readonly scriptService: RemoteSetupScriptService;

    @inject(ApplicationPackage)
    protected readonly applicationPackage: ApplicationPackage;

    @inject(ContributionProvider) @named(RemoteCliContribution)
    protected readonly cliContributions: ContributionProvider<RemoteCliContribution>;

    async setup(options: RemoteSetupOptions): Promise<RemoteSetupResult> {
        const {
            connection,
            report,
            nodeDownloadTemplate
        } = options;
        report('Identifying remote system...');
        // 1. Identify remote platform
        const platform = await this.detectRemotePlatform(connection);
        // 2. Setup home directory
        const remoteHome = await this.getRemoteHomeDirectory(connection, platform);
        const applicationDirectory = this.scriptService.joinPath(platform, remoteHome, `.${this.getRemoteAppName()}`);
        await this.mkdirRemote(connection, platform, applicationDirectory);
        // 3. Download+copy node for that platform
        const nodeFileName = this.nodeSetupService.getNodeFileName(platform);
        const nodeDirName = this.nodeSetupService.getNodeDirectoryName(platform);
        const remoteNodeDirectory = this.scriptService.joinPath(platform, applicationDirectory, nodeDirName);
        const nodeDirExists = await this.dirExistsRemote(connection, remoteNodeDirectory);
        if (!nodeDirExists) {
            report('Downloading and installing Node.js on remote...');
            // Download the binaries locally and move it via SSH
            const nodeArchive = await this.nodeSetupService.downloadNode(platform, nodeDownloadTemplate);
            const remoteNodeZip = this.scriptService.joinPath(platform, applicationDirectory, nodeFileName);
            await connection.copy(nodeArchive, remoteNodeZip);
            await this.unzipRemote(connection, platform, remoteNodeZip, applicationDirectory);
        }
        // 4. Copy backend to remote system
        const libDir = this.scriptService.joinPath(platform, applicationDirectory, 'lib');
        const libDirExists = await this.dirExistsRemote(connection, libDir);
        if (!libDirExists) {
            report('Installing application on remote...');
            const applicationZipFile = this.scriptService.joinPath(platform, applicationDirectory, `${this.getRemoteAppName()}.tar`);
            await this.copyService.copyToRemote(connection, platform, applicationZipFile);
            await this.unzipRemote(connection, platform, applicationZipFile, applicationDirectory);
        }
        // 5. start remote backend
        report('Starting application on remote...');
        const port = await this.startApplication(connection, platform, applicationDirectory, remoteNodeDirectory);
        connection.remotePort = port;
        return {
            applicationDirectory: libDir,
            nodeDirectory: remoteNodeDirectory
        };
    }

    protected async startApplication(connection: RemoteConnection, platform: RemotePlatform, remotePath: string, nodeDir: string): Promise<number> {
        const nodeExecutable = this.scriptService.joinPath(platform, nodeDir, ...(platform.os === OS.Type.Windows ? ['node.exe'] : ['bin', 'node']));
        const mainJsFile = this.scriptService.joinPath(platform, remotePath, 'lib', 'backend', 'main.js');
        const localAddressRegex = /listening on http:\/\/0.0.0.0:(\d+)/;
        let prefix = '';
        if (platform.os === OS.Type.Windows) {
            // We might to switch to PowerShell beforehand on Windows
            prefix = this.scriptService.exec(platform) + ' ';
        }
        const remoteContext: RemoteCliContext = {
            platform,
            directory: remotePath
        };
        const args: string[] = ['--hostname=0.0.0.0', `--port=${connection.remotePort ?? 0}`, '--remote'];
        for (const cli of this.cliContributions.getContributions()) {
            if (cli.enhanceArgs) {
                args.push(...await cli.enhanceArgs(remoteContext));
            }
        }
        // Change to the remote application path and start a node process with the copied main.js file
        // This way, our current working directory is set as expected
        const result = await connection.execPartial(`${prefix}cd "${remotePath}";${nodeExecutable}`,
            stdout => localAddressRegex.test(stdout),
            [mainJsFile, ...args]);

        const match = localAddressRegex.exec(result.stdout);
        if (!match) {
            throw new Error('Could not start remote system: ' + result.stderr);
        } else {
            return Number(match[1]);
        }
    }

    protected async detectRemotePlatform(connection: RemoteConnection): Promise<RemotePlatform> {
        const osResult = await connection.exec('uname -s');

        let os: OS.Type | undefined;
        if (osResult.stderr) {
            // Only Windows systems return an error stream here
            os = OS.Type.Windows;
        } else if (osResult.stdout) {
            if (osResult.stdout.includes('windows32') || osResult.stdout.includes('MINGW64')) {
                os = OS.Type.Windows;
            } else if (osResult.stdout.includes('Linux')) {
                os = OS.Type.Linux;
            } else if (osResult.stdout.includes('Darwin')) {
                os = OS.Type.OSX;
            }
        }
        if (!os) {
            throw new Error('Failed to identify remote system: ' + osResult.stdout + '\n' + osResult.stderr);
        }
        let arch: string | undefined;
        if (os === OS.Type.Windows) {
            const processorArchitecture = await connection.exec('cmd /c echo %PROCESSOR_ARCHITECTURE%');
            if (processorArchitecture.stdout.includes('64')) {
                arch = 'x64';
            } else if (processorArchitecture.stdout.includes('x86')) {
                arch = 'x86';
            }
        } else {
            const archResult = (await connection.exec('uname -m')).stdout;
            if (archResult.includes('x86_64')) {
                arch = 'x64';
            } else if (archResult.match(/i\d83/)) { // i386, i483, i683
                arch = 'x86';
            } else if (archResult.includes('aarch64')) {
                arch = 'arm64';
            } else {
                arch = archResult.trim();
            }
        }
        if (!arch) {
            throw new Error('Could not identify remote system architecture');
        }
        return {
            os,
            arch
        };
    }

    protected async getRemoteHomeDirectory(connection: RemoteConnection, platform: RemotePlatform): Promise<string> {
        const result = await connection.exec(this.scriptService.home(platform));
        return result.stdout.trim();
    }

    protected getRemoteAppName(): string {
        const appName = this.applicationPackage.pck.name || 'theia';
        const appVersion = this.applicationPackage.pck.version || THEIA_VERSION;
        return `${this.cleanupDirectoryName(`${appName}-${appVersion}`)}-remote`;
    }

    protected cleanupDirectoryName(name: string): string {
        return name.replace(/[@<>:"\\|?*]/g, '').replace(/\//g, '-');
    }

    protected async mkdirRemote(connection: RemoteConnection, platform: RemotePlatform, remotePath: string): Promise<void> {
        const result = await connection.exec(this.scriptService.mkdir(platform, remotePath));
        if (result.stderr) {
            throw new Error('Failed to create directory: ' + result.stderr);
        }
    }

    protected async dirExistsRemote(connection: RemoteConnection, remotePath: string): Promise<boolean> {
        const cdResult = await connection.exec(`cd "${remotePath}"`);
        return !Boolean(cdResult.stderr);
    }

    protected async unzipRemote(connection: RemoteConnection, platform: RemotePlatform, remoteFile: string, remoteDirectory: string): Promise<void> {
        const result = await connection.exec(this.scriptService.unzip(platform, remoteFile, remoteDirectory));
        if (result.stderr) {
            throw new Error('Failed to unzip: ' + result.stderr);
        }
    }

    protected async executeScriptRemote(connection: RemoteConnection, platform: RemotePlatform, script: string): Promise<RemoteExecResult> {
        return connection.exec(this.scriptService.exec(platform), [script]);
    }
}
