// *****************************************************************************
// Copyright (C) 2025 Typefox and others.
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

import { injectable } from '@theia/core/shared/inversify';
import * as Docker from 'dockerode';
import { ComposeContainer, DevContainerConfiguration } from '../devcontainer-file';
import { ContainerOutputProvider } from '../../electron-common/container-output-provider';
import { spawn } from 'child_process';
import path = require('path');

@injectable()
export class DockerComposeService {

    async createContainers(
        devcontainerConfig: DevContainerConfiguration,
        containerCreateOptions: Docker.ContainerCreateOptions,
        outputProvider?: ContainerOutputProvider): Promise<string> {

        if (!devcontainerConfig.dockerComposeFile || typeof devcontainerConfig.dockerComposeFile !== 'string') {
            throw new Error('dockerComposeFile is not defined in devcontainer configuration. Multiple files are not supported currently');
        }

        const dockerComposeFilePath = resolveComposeFilePath(devcontainerConfig);

        const composeUpArgs = Array.isArray(devcontainerConfig.composeUpArgs) ? devcontainerConfig.composeUpArgs : [];
        await this.executeComposeCommand(dockerComposeFilePath, 'up', ['--detach', ...composeUpArgs], outputProvider);

        return (devcontainerConfig as ComposeContainer).service;
    }

    protected executeComposeCommand(composeFilePath: string, command: string, args: string[], outputProvider?: ContainerOutputProvider): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const process = spawn('docker', ['compose', '-f', composeFilePath, command, ...args]);
            process.stdout.on('data', data => {
                outputProvider?.onRemoteOutput(data.toString());
            });
            process.stderr.on('data', data => {
                outputProvider?.onRemoteOutput(data.toString());
            });
            process.on('close', code => {
                outputProvider?.onRemoteOutput(`docker compose process exited with code ${code}`);
                if (code === 0) {
                    resolve(''); // TODO return real container ids
                } else {
                    reject(new Error(`docker compose process exited with code ${code}`));
                }
            });
        });
    }
}

export function resolveComposeFilePath(devcontainerConfig: DevContainerConfiguration): string {
    if (!devcontainerConfig.dockerComposeFile) {
        throw new Error('dockerComposeFile is not defined in devcontainer configuration.');
    }

    if (typeof devcontainerConfig.dockerComposeFile !== 'string') {
        throw new Error('Multiple docker compose files are not supported currently.');
    }

    if (path.isAbsolute(devcontainerConfig.dockerComposeFile)) {
        return devcontainerConfig.dockerComposeFile;
    } else {
        return path.resolve(path.dirname(devcontainerConfig.location!), devcontainerConfig.dockerComposeFile);
    }
}
