// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Command, CommandContribution, CommandRegistry } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { RemoteContainerCommands } from '@theia/dev-container/lib/electron-browser/container-connection-contribution';

export namespace QaapCloudElectronCommands {
    export const OPEN_IN_DEV_CONTAINER = Command.toLocalizedCommand({
        id: 'qaap.cloud.openInDevContainer',
        label: 'Open in Qaap Cloud Container',
        category: 'Qaap Cloud',
    }, 'qaap/cloud/openInDevContainer');
}

const QAAP_DEVCONTAINER = {
    name: 'Qaap Cloud',
    image: 'mcr.microsoft.com/devcontainers/typescript-node:20',
    workspaceFolder: '/workspace',
    forwardPorts: [3000, 5173],
    postCreateCommand: 'npm install || true',
};

@injectable()
export class QaapCloudDevcontainerContribution implements CommandContribution {

    @inject(WorkspaceService)
    protected readonly workspace: WorkspaceService;

    @inject(FileService)
    protected readonly files: FileService;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(QaapCloudElectronCommands.OPEN_IN_DEV_CONTAINER, {
            execute: () => this.openInDevContainer(),
            isEnabled: () => Boolean(this.workspace.workspace),
        });
    }

    protected async openInDevContainer(): Promise<void> {
        const root = this.workspace.workspace?.resource;
        if (!root) {
            return;
        }
        const devcontainerUri = root.resolve('.devcontainer/devcontainer.json');
        const exists = await this.files.exists(devcontainerUri);
        if (!exists) {
            const content = JSON.stringify(QAAP_DEVCONTAINER, undefined, 2);
            await this.files.writeFile(devcontainerUri, BinaryBuffer.fromString(content));
        }
        await this.commands.executeCommand(RemoteContainerCommands.REOPEN_IN_CONTAINER.id);
    }
}
