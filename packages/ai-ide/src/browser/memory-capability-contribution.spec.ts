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

import { expect } from 'chai';
import { PromptService } from '@theia/ai-core';
import { Container } from '@theia/core/shared/inversify';
import {
    FILE_CONTENT_FUNCTION_ID,
    FIND_FILES_BY_PATTERN_FUNCTION_ID,
    GET_WORKSPACE_FILE_LIST_FUNCTION_ID,
    SEARCH_IN_WORKSPACE_FUNCTION_ID
} from '../common/workspace-functions';
import { WRITE_FILE_CONTENT_ID, WRITE_FILE_REPLACEMENTS_ID } from '../common/file-changeset-function-ids';
import { MEMORY_DIRECTORY_VARIABLE } from './memory-directory-variable-contribution';
import { MemoryCapabilityContribution } from './memory-capability-contribution';

const registerFragment = (): { id: string, template: string } => {
    const fragments: Array<{ id: string, template: string }> = [];
    const container = new Container();
    container.bind(PromptService).toConstantValue({
        addBuiltInPromptFragment: (fragment: { id: string, template: string }) => fragments.push(fragment)
    } as unknown as PromptService);
    container.bind(MemoryCapabilityContribution).toSelf();
    container.get(MemoryCapabilityContribution).onStart();

    expect(fragments).to.have.lengthOf(1);
    return fragments[0];
};

describe('MemoryCapabilityContribution', () => {

    it('registers the memory fragment', () => {
        const fragment = registerFragment();
        expect(fragment.id).to.equal('memory');
        expect(fragment.template).to.contain('## Memory');
    });

    it('starts the template with unindented front matter, so it parses as such', () => {
        const { template } = registerFragment();
        const lines = template.split('\n');
        expect(lines[0]).to.equal('---');
        expect(lines[1]).to.match(/^name: /);
        expect(lines[2]).to.match(/^description: /);
        expect(lines[3]).to.equal('---');
    });

    it('points the agent at the memory directory variable instead of a workspace path', () => {
        const { template } = registerFragment();
        expect(template).to.contain(`{{${MEMORY_DIRECTORY_VARIABLE.name}}}/wiki/index.md`);
        expect(template).to.contain(`{{${MEMORY_DIRECTORY_VARIABLE.name}}}/raw/`);
        expect(template).to.not.contain('.agents/memory');
    });

    it('resolves the date for raw filenames through the today variable', () => {
        const { template } = registerFragment();
        expect(template).to.contain('{{today:inIso8601}}');
    });

    it('instructs the agent to use the generic workspace tools', () => {
        const { template } = registerFragment();
        [
            FILE_CONTENT_FUNCTION_ID,
            FIND_FILES_BY_PATTERN_FUNCTION_ID,
            GET_WORKSPACE_FILE_LIST_FUNCTION_ID,
            SEARCH_IN_WORKSPACE_FUNCTION_ID,
            WRITE_FILE_CONTENT_ID,
            WRITE_FILE_REPLACEMENTS_ID
        ].forEach(id => {
            expect(template).to.contain(`~{${id}}`);
        });
    });
});
