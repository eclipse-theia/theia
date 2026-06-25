// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { ChatResponseContent, CodeChatResponseContent } from '@theia/ai-chat/lib/common';
import { UntitledResourceResolver } from '@theia/core';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactNode } from '@theia/core/shared/react';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { ChatResponsePartRenderer } from '../chat-response-part-renderer';
import { ResponseNode } from '../chat-tree-view/chat-view-tree-widget';
import { MermaidViewer } from './mermaid-rendering';

/** Priority returned by {@link MermaidPartRenderer.canHandle}. Must exceed the {@link CodePartRenderer} priority (10). */
const MERMAID_RENDERER_PRIORITY = 15;

/**
 * Renders a `mermaid` code block (```` ```mermaid ````) as a diagram instead of plain code.
 *
 * The default {@link CodePartRenderer} already turns the fenced block into a {@link CodeChatResponseContent}
 * with `language === 'mermaid'`. This renderer simply claims those parts with a higher priority and renders
 * the diagram via {@link MermaidViewer}. Anything that cannot be rendered (incomplete stream, invalid
 * definition) transparently falls back to the regular code view.
 */
@injectable()
export class MermaidPartRenderer implements ChatResponsePartRenderer<CodeChatResponseContent> {

    @inject(MonacoEditorProvider)
    protected readonly editorProvider: MonacoEditorProvider;

    @inject(UntitledResourceResolver)
    protected readonly untitledResourceResolver: UntitledResourceResolver;

    @inject(ThemeService)
    protected readonly themeService: ThemeService;

    @inject(ClipboardService)
    protected readonly clipboardService: ClipboardService;

    canHandle(response: ChatResponseContent): number {
        if (CodeChatResponseContent.is(response) && response.language?.toLowerCase() === 'mermaid') {
            return MERMAID_RENDERER_PRIORITY;
        }
        return -1;
    }

    render(response: CodeChatResponseContent, parentNode: ResponseNode): ReactNode {
        return (
            <MermaidViewer
                code={response.code}
                isComplete={parentNode.response.isComplete}
                themeService={this.themeService}
                clipboardService={this.clipboardService}
                editorProvider={this.editorProvider}
                untitledResourceResolver={this.untitledResourceResolver}
            />
        );
    }
}
