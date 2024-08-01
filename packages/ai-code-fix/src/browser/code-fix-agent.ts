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

import {
    Agent, CommunicationHistoryEntry, CommunicationRecordingService,
    getTextOfResponse, LanguageModelRegistry, LanguageModelRequest,
    LanguageModelRequirement,
    PromptService, PromptTemplate
} from '@theia/ai-core/lib/common';
import { generateUuid } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import * as monaco from '@theia/monaco-editor-core';
import { ITextModel } from '@theia/monaco-editor-core/esm/vs/editor/common/model';
import { CodeActionContext } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneLanguages';

export const CodeFixAgent = Symbol('CodeFixAgent');
export interface CodeFixAgent extends Agent {
    provideQuickFix(model: monaco.editor.ITextModel, marker: monaco.editor.IMarkerData,
        context: monaco.languages.CodeActionContext & CodeActionContext, token: monaco.CancellationToken): Promise<monaco.languages.CodeAction[]>;
}

@injectable()
export class CodeFixAgentImpl implements CodeFixAgent {
    variables: string[];

    @inject(LanguageModelRegistry)
    protected languageModelRegistry: LanguageModelRegistry;

    @inject(PromptService)
    protected promptService: PromptService;

    @inject(CommunicationRecordingService)
    protected recordingService: CommunicationRecordingService;

    async provideQuickFix(model: monaco.editor.ITextModel & ITextModel, marker: monaco.editor.IMarkerData,
        context: monaco.languages.CodeActionContext & CodeActionContext, token: monaco.CancellationToken): Promise<monaco.languages.CodeAction[]> {

        const languageModel = await this.languageModelRegistry.selectLanguageModel({
            agent: this.id,
            ...this.languageModelRequirements[0]
        });
        if (!languageModel) {
            console.error('No language model found for code-fix-agent');
            return [];
        }
        console.log('Code fix agent is using language model:', languageModel.id);

        const fileName = model.uri.toString(false);
        const language = model.getLanguageId();
        const errorMsg = marker.message;
        const lineNumber = marker.startLineNumber;
        const contextStartLineNumber = Math.max(0, marker.startLineNumber - 10);
        const contextEndLineNumber = Math.min(model.getLineCount(), marker.endLineNumber + 10);
        const contextRange = {
            startLineNumber: contextStartLineNumber,
            startColumn: 1,
            endLineNumber: contextEndLineNumber,
            endColumn: model.getLineMaxColumn(contextEndLineNumber)
        };
        const contextRangeContent = model.getValueInRange(contextRange);
        const editor = monaco.editor.getEditors().find(ed => ed.getModel() === model);
        if (!editor) {
            console.error('No editor found for code-fix-agent');
            return [];
        }

        const prompt = await this.promptService.getPrompt('code-fix-prompt', { contextRangeContent, file: fileName, language, errorMsg: errorMsg, lineNumber: lineNumber });
        if (!prompt) {
            console.error('No prompt found for code-fix-agent');
            return [];
        }
        console.log('Code fix agent is using prompt:', prompt);

        // since we do not actually hold complete conversions, the request/response pair is considered a session
        const sessionId = generateUuid();
        const requestId = generateUuid();
        const request: LanguageModelRequest = { messages: [{ type: 'text', actor: 'user', query: prompt.trim() }] };
        const requestEntry: CommunicationHistoryEntry = {
            agentId: this.id,
            sessionId,
            timestamp: Date.now(),
            requestId,
            request: prompt
        };
        this.recordingService.recordRequest(requestEntry);
        const response = await languageModel.request(request);
        const fixText = await getTextOfResponse(response);
        this.recordingService.recordResponse({
            agentId: this.id,
            sessionId,
            timestamp: Date.now(),
            requestId,
            response: fixText
        });
        console.log('Code fix agent suggests', fixText);

        return [
            {
                title: 'AI QuickFix',
                command: {
                    id: 'ai-code-fix',
                    title: 'AI Code Fix',
                    arguments: [{ model, editor, range: contextRange, newText: fixText }]
                },
            }];

    };
    id: string = 'code-fix-agent';
    name: string = 'Code Fix Agent';
    description: string = 'This agent provides fixes for problem markers';
    promptTemplates: PromptTemplate[] = [
        {
            id: 'code-fix-prompt',
            template: `
            You are a code fixing agent. The current file you have to fix is named \${file}.
            The language of the file is \${language}.
            Provide a corrected version of the following code snippet.
            As result, return only the fixed snippet as plain text without markdown formatting.

            \${contextRangeContent}

            The error is reported on line number \${lineNumber} and the error message is \${errorMsg}.
            Provide the full content of the file.
            `,
        }
    ];
    languageModelRequirements: LanguageModelRequirement[] = [{
        purpose: 'code-fix',
        identifier: 'openai/gpt-4o'
    }];
}
