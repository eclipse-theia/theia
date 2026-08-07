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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { URI } from '@theia/core';
import { CustomAgentsLocation } from '@theia/ai-core/lib/common';
import { AIAgentConfigurationWidget } from './agent-configuration-widget';

disableJSDOM();

describe('AIAgentConfigurationWidget - selectAgentScopeOptions', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let widget: AIAgentConfigurationWidget;
    beforeEach(() => { widget = new AIAgentConfigurationWidget(); });

    const agentsDir = (scope: string): CustomAgentsLocation =>
        ({ uri: new URI(`file:///ws/${scope}`).resolve('agents'), exists: false, kind: 'agents-dir' });
    const existingAgentsDir = (scope: string): CustomAgentsLocation =>
        ({ uri: new URI(`file:///ws/${scope}`).resolve('agents'), exists: true, kind: 'agents-dir' });
    const legacyYaml = (scope: string): CustomAgentsLocation =>
        ({ uri: new URI(`file:///ws/${scope}`).resolve('customAgents.yml'), exists: false, kind: 'legacy-yaml' });

    const select = (locations: CustomAgentsLocation[]): string[] =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (widget as any).selectAgentScopeOptions(locations).map((o: { scopeDir: URI }) => o.scopeDir.path.toString());

    it('keeps only the default .agents scope when no scope has an agents folder', () => {
        const locations = [
            agentsDir('.agents'), legacyYaml('.agents'),
            agentsDir('.prompts'), legacyYaml('.prompts')
        ];

        expect(select(locations)).to.deep.equal(['/ws/.agents']);
    });

    it('keeps a non-default scope that already contains an agents folder', () => {
        const locations = [
            agentsDir('.agents'), legacyYaml('.agents'),
            existingAgentsDir('.prompts'), legacyYaml('.prompts')
        ];

        expect(select(locations)).to.deep.equal(['/ws/.agents', '/ws/.prompts']);
    });

    it('ignores legacy customAgents.yml entries', () => {
        const locations = [agentsDir('.agents'), legacyYaml('.agents')];

        expect(select(locations)).to.deep.equal(['/ws/.agents']);
    });
});
