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

import { CodeFixAgent } from './code-fix-agent';
import { injectable, inject } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core/lib/browser';
import { ITextModel } from '@theia/monaco-editor-core/esm/vs/editor/common/model';
import { CodeActionContext } from '@theia/monaco-editor-core/esm/vs/editor/standalone/browser/standaloneLanguages';
import { Deferred } from '@theia/core/lib/common/promise-util';

@injectable()
export class AICodeFixProvider implements monaco.languages.CodeActionProvider {

    @inject(CodeFixAgent)
    protected readonly agent: CodeFixAgent;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    private pendingCodeFixRequest = Promise.resolve<monaco.languages.CodeAction[]>([]);

    constructor() {
    }

    async provideCodeActions(model: monaco.editor.ITextModel & ITextModel,
        range: monaco.Range,
        context: monaco.languages.CodeActionContext & CodeActionContext,
        token: monaco.CancellationToken):
        Promise<monaco.languages.CodeActionList | undefined> {
        const codeActions = [];
        for (const marker of (context as monaco.languages.CodeActionContext).markers) {
            if (range.startLineNumber === marker.startLineNumber) {
                codeActions.push(...(await this.postCodeFixRequest(model, marker, context, token)));
            }
        }
        return { actions: codeActions, dispose: () => { } };
    }

    resolveCodeAction?(codeAction: monaco.languages.CodeAction, token: monaco.CancellationToken): monaco.languages.ProviderResult<monaco.languages.CodeAction> {
        throw new Error('Method not implemented.');
    }

    protected async postCodeFixRequest(...args: Parameters<CodeFixAgent['provideQuickFix']>): ReturnType<CodeFixAgent['provideQuickFix']> {
        const result = new Deferred<Awaited<ReturnType<CodeFixAgent['provideQuickFix']>>>();
        const previousPending = this.pendingCodeFixRequest;
        this.pendingCodeFixRequest = previousPending.finally(async () => result.resolve(await this.agent.provideQuickFix(...args)));
        return result.promise;
    }
}
