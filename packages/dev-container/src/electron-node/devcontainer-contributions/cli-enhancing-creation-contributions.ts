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

import { RemoteCliContext, RemoteCliContribution } from '@theia/core/lib/node/remote/remote-cli-contribution';
import { ContainerCreationContribution } from '../docker-container-service';
import * as Docker from 'dockerode';
import { DevContainerConfiguration, } from '../devcontainer-file';
import { injectable, interfaces } from '@theia/core/shared/inversify';

export function registerTheiaStartOptionsContributions(bind: interfaces.Bind): void {
    bind(ContainerCreationContribution).toService(ExtensionsContribution);
    bind(ContainerCreationContribution).toService(SettingsContribution);
}

@injectable()
export class ExtensionsContribution implements RemoteCliContribution, ContainerCreationContribution {
    protected currentConfig: DevContainerConfiguration | undefined;

    enhanceArgs(context: RemoteCliContext): string[] {
        if (!this.currentConfig) {
            return [];
        }
        const extensions = [
            ...(this.currentConfig.extensions ?? []),
            ...(this.currentConfig.customizations?.vscode?.extensions ?? [])
        ];
        this.currentConfig = undefined;
        return extensions?.map(extension => `--install-plugin=${extension}`);
    }

    async handleContainerCreation(createOptions: Docker.ContainerCreateOptions, containerConfig: DevContainerConfiguration): Promise<void> {
        this.currentConfig = containerConfig;
    }
}

@injectable()
export class SettingsContribution implements RemoteCliContribution, ContainerCreationContribution {
    protected currentConfig: DevContainerConfiguration | undefined;

    enhanceArgs(context: RemoteCliContext): string[] {
        if (!this.currentConfig) {
            return [];
        }
        const settings = {
            ...(this.currentConfig.settings ?? {}),
            ...(this.currentConfig.customizations?.vscode?.settings ?? [])
        };
        this.currentConfig = undefined;
        return Object.entries(settings).map(([key, value]) => `--set-preference=${key}=${JSON.stringify(value)}`) ?? [];
    }

    async handleContainerCreation(createOptions: Docker.ContainerCreateOptions, containerConfig: DevContainerConfiguration): Promise<void> {
        this.currentConfig = containerConfig;
    }
}
