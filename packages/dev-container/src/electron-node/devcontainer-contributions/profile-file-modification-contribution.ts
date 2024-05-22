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

import { DevContainerConfiguration } from '../devcontainer-file';
import { ContainerCreationContribution } from '../docker-container-service';
import * as Docker from 'dockerode';
import { injectable } from '@theia/core/shared/inversify';
import { ContainerOutputProvider } from '../../electron-common/container-output-provider';

/**
 * this contribution changes the /etc/profile file so that it won't overwrite the PATH variable set by docker
 */
@injectable()
export class ProfileFileModificationContribution implements ContainerCreationContribution {
    async handlePostCreate(containerConfig: DevContainerConfiguration, container: Docker.Container, api: Docker, outputprovider: ContainerOutputProvider): Promise<void> {
        const stream = await (await container.exec({
            Cmd: ['sh', '-c', 'sed -i \'s|PATH="\\([^"]*\\)"|PATH=${PATH:-"\\1"}|g\' /etc/profile'], User: 'root',
            AttachStderr: true, AttachStdout: true
        })).start({});
        stream.on('data', data => outputprovider.onRemoteOutput(data.toString()));
    }
}
