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

import { injectable } from '@theia/core/shared/inversify';
import { ContainerCreationContribution } from '../docker-container-service';
import { MaybePromise } from '@theia/core';
import { ContainerCreateOptions } from 'dockerode';
import { ContainerOutputProvider } from '../../electron-common/container-output-provider';
import { DevContainerConfiguration } from '../devcontainer-file';
import * as Docker from 'dockerode';

@injectable()
export class WorkspaceCreationContribution implements ContainerCreationContribution {
    handleContainerCreation(createOptions: ContainerCreateOptions,
        containerConfig: DevContainerConfiguration, api: Docker,
        outputProvider?: ContainerOutputProvider | undefined): MaybePromise<void> {

        if (containerConfig.workspaceMount && containerConfig.workspaceFolder && createOptions.HostConfig?.Mounts) {
            createOptions.HostConfig.Mounts[0] = {
                ...createOptions.HostConfig.Mounts[0],
                ...this.parseWorkspaceMount(containerConfig.workspaceMount as string)
            };
        }
    }

    protected parseWorkspaceMount(workspaceMount: string): Partial<Docker.MountSettings> {

        const mountSetting: Partial<Docker.MountSettings> = {};

        const entries = workspaceMount.split(',');

        for (const entry of entries) {
            const [key, value] = entry.split('=');

            if (key === 'type') {
                mountSetting.Type = value as Docker.MountType;
            } else if (key === 'source' || key === 'src') {
                mountSetting.Source = value;
            } else if (key === 'target' || key === 'dst' || key === 'destination') {
                mountSetting.Target = value;
            } else if (key === 'readonly' || key === 'ro') {
                mountSetting.ReadOnly = true;
            } else if (key === 'bind-propagation') {
                mountSetting.BindOptions = {
                    Propagation: value as Docker.MountPropagation
                };
            }
        }

        return mountSetting;
    }
}
