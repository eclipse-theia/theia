// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { PreferenceService } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PREFERENCE_NAME_AUTO_ADD_OPEN_EDITORS } from '../common/ai-ide-preferences';
import URI from '@theia/core/lib/common/uri';
import { FILE_VARIABLE } from '@theia/ai-core/lib/browser/file-variable-contribution';
import { ChatContextManager, ChatService, isSessionCreatedEvent } from '@theia/ai-chat/lib/common';
import { EditorManager } from '@theia/editor/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';

/**
 * Automatically populates the active chat session's context with open editor files.
 *
 * When a new chat session is created, all currently open workspace editors are added
 * as file context variables. When a new editor is opened while an active session exists,
 * that file is added to the session's context as well. Files outside the workspace are
 * ignored, and duplicates are prevented by the existing deduplication in {@link ChatContextManager.addVariables}.
 *
 * The added files appear as removable context pills in the chat input UI, allowing
 * users to discard irrelevant files before sending a message.
 */
@injectable()
export class OpenEditorsContextContribution implements FrontendApplicationContribution {
    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    protected get isEnabled(): boolean {
        return this.preferenceService.get<boolean>(PREFERENCE_NAME_AUTO_ADD_OPEN_EDITORS, true);
    }

    onStart(): void {
        this.chatService.onSessionEvent(event => {
            if (isSessionCreatedEvent(event)) {
                if (!this.isEnabled) {
                    return;
                }
                const activeSession = this.chatService.getActiveSession();
                if (activeSession && activeSession.id === event.sessionId) {
                    for (const editor of this.editorManager.all) {
                        const uri = editor.getResourceUri();
                        if (uri) {
                            this.addFileToContext(uri, activeSession.model.context);
                        }
                    }
                }
            }
        });

        this.editorManager.onCreated(widget => {
            if (!this.isEnabled) {
                return;
            }
            const uri = widget.getResourceUri();
            if (uri) {
                const activeSession = this.chatService.getActiveSession();
                if (activeSession) {
                    this.addFileToContext(uri, activeSession.model.context);
                }
            }
        });
    }

    protected addFileToContext(uri: URI, context: ChatContextManager): void {
        const rootUri = this.workspaceService.getWorkspaceRootUri(uri);
        if (!rootUri) {
            return;
        }
        const relativePath = this.workspaceService.getRootPrefixedPath(uri);
        context.addVariables({ variable: FILE_VARIABLE, arg: relativePath });
    }
}
