// *****************************************************************************
// Copyright (C) 2026 Ericsson and Others.
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

import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { MessageService } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { AgentSessionHookData, AgentSessionHookRegistry } from '@theia/ai-core';
import { EditorManager } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { URI } from '@theia/core/lib/common/uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';

@injectable()
export class ClaudeCodeHookFrontendContribution implements FrontendApplicationContribution {

    @inject(AgentSessionHookRegistry)
    protected readonly hookRegistry: AgentSessionHookRegistry;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @postConstruct()
    protected init(): void {
        this.hookRegistry.onHookEvent(event => this.handleHookEvent(event));
    }

    async onStart(): Promise<void> {
        // Registration happens in @postConstruct
    }

    protected handleHookEvent(event: AgentSessionHookData): void {
        switch (event.event) {
            case 'PostToolUse':
                this.handlePostToolUse(event);
                break;
            case 'Notification':
                this.handleNotification(event);
                break;
        }
    }

    protected async handlePostToolUse(event: AgentSessionHookData): Promise<void> {
        const filePath = event.toolInput?.file_path as string | undefined;
        if (!filePath) {
            return;
        }
        const roots = await this.workspaceService.roots;
        if (roots.length === 0) {
            return;
        }
        const rootUri = roots[0].resource;
        const fileUri = rootUri.resolve(filePath);
        // Refresh the file in the editor if it's open
        for (const editor of this.editorManager.all) {
            if (editor.editor.uri.toString() === fileUri.toString()) {
                try {
                    await this.fileService.resolve(new URI(fileUri.toString()), { resolveMetadata: true });
                } catch {
                    // File may have been deleted
                }
                break;
            }
        }
    }

    protected handleNotification(event: AgentSessionHookData): void {
        const message = event.payload?.message as string
            || event.payload?.title as string
            || 'Claude Code notification';
        this.messageService.info(message);
    }
}
