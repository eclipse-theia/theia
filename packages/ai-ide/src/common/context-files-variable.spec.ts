// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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

import { expect } from 'chai';
import { AIVariableResolutionRequest } from '@theia/ai-core';
import { CONTEXT_FILES_VARIABLE, ContextFilesVariableContribution, NO_CONTEXT_FILES_VALUE } from './context-files-variable';

describe('ContextFilesVariableContribution', () => {

    /** A chat session context whose session carries the given context variables. */
    function sessionContext(variables: AIVariableResolutionRequest[]): object {
        return { model: { context: { getVariables: () => variables } } };
    }

    const file = (path: string): AIVariableResolutionRequest => ({ variable: { id: 'file', name: 'file', description: '' }, arg: path });

    it('lists the attached files, one per line', async () => {
        const context = sessionContext([file('src/a.ts'), { variable: { id: 'other', name: 'other', description: '' }, arg: 'x' }, file('src/b.ts')]);
        const result = await new ContextFilesVariableContribution().resolve({ variable: CONTEXT_FILES_VARIABLE }, context);
        expect(result?.value).to.equal('- src/a.ts\n- src/b.ts');
    });

    it('resolves to an explicit marker when no file is attached', async () => {
        const result = await new ContextFilesVariableContribution().resolve({ variable: CONTEXT_FILES_VARIABLE }, sessionContext([]));
        expect(result?.value).to.equal(NO_CONTEXT_FILES_VALUE);
    });

    it('resolves nothing outside of a chat session context', async () => {
        const result = await new ContextFilesVariableContribution().resolve({ variable: CONTEXT_FILES_VARIABLE }, {});
        expect(result).to.be.undefined;
    });
});
