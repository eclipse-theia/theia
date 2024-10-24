// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

import * as monaco from '@theia/monaco-editor-core';

import { inject, injectable } from '@theia/core/shared/inversify';
import { CodeCompletionAgent } from '../common/code-completion-agent';
import { AgentService } from '@theia/ai-core';

@injectable()
export class AICodeInlineCompletionsProvider
    implements monaco.languages.InlineCompletionsProvider {
    @inject(CodeCompletionAgent)
    protected readonly agent: CodeCompletionAgent;
    @inject(AgentService)
    private readonly agentService: AgentService;

    async provideInlineCompletions(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
        context: monaco.languages.InlineCompletionContext,
        token: monaco.CancellationToken
    ): Promise<monaco.languages.InlineCompletions | undefined> {
        if (!this.agentService.isEnabled(this.agent.id)) {
            return undefined;
        }
        return this.agent.provideInlineCompletions(
            model,
            position,
            context,
            token
        );
    }

    freeInlineCompletions(
        completions: monaco.languages.InlineCompletions<monaco.languages.InlineCompletion>
    ): void {
        // nothing to do
    }
}
