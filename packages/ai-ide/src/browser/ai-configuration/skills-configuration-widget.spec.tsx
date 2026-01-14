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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import * as ReactDOM from '@theia/core/shared/react-dom';

import { Emitter, URI } from '@theia/core';

import { OpenHandler, OpenerService } from '@theia/core/lib/browser';
import { Skill } from '@theia/ai-core/lib/common/skill';
import { SkillService } from '@theia/ai-core/lib/browser/skill-service';

import { AISkillsConfigurationWidget } from './skills-configuration-widget';

disableJSDOM();

describe('AISkillsConfigurationWidget', () => {
    let host: HTMLElement;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        host = document.createElement('div');
        document.body.appendChild(host);
    });

    afterEach(() => {
        ReactDOM.unmountComponentAtNode(host);
        host.remove();
    });

    function renderWidget(widget: AISkillsConfigurationWidget): void {
        const element = (widget as unknown as { render: () => React.ReactNode }).render();
        ReactDOM.render(element as React.ReactElement, host);
    }

    it('renders empty state when SkillService.getSkills() returns []', () => {
        const widget = new AISkillsConfigurationWidget();

        const onSkillsChangedEmitter = new Emitter<void>();
        const skillService: Partial<SkillService> = {
            getSkills: () => [],
            onSkillsChanged: onSkillsChangedEmitter.event
        };
        (widget as unknown as { skillService: SkillService }).skillService = skillService as SkillService;

        (widget as unknown as { openerService: OpenerService }).openerService = {} as OpenerService;

        (widget as unknown as { init: () => void }).init();
        renderWidget(widget);

        expect(host.querySelectorAll('tbody tr').length).to.equal(0);
    });

    it('renders multiple skills with correct name/description/location', () => {
        const widget = new AISkillsConfigurationWidget();

        const skills: Skill[] = [
            { name: 'Skill A', description: 'Desc A', location: '/path/a' } as Skill,
            { name: 'Skill B', description: 'Desc B', location: '/path/b' } as Skill
        ];

        const onSkillsChangedEmitter = new Emitter<void>();
        const skillService: Partial<SkillService> = {
            getSkills: () => skills,
            onSkillsChanged: onSkillsChangedEmitter.event
        };
        (widget as unknown as { skillService: SkillService }).skillService = skillService as SkillService;

        (widget as unknown as { openerService: OpenerService }).openerService = {} as OpenerService;

        (widget as unknown as { init: () => void }).init();
        renderWidget(widget);

        const rows = Array.from(host.querySelectorAll('tbody tr'));
        expect(rows.length).to.equal(2);

        expect(rows[0].querySelector('.skill-name-column')?.textContent).to.contain('Skill A');
        expect(rows[0].querySelector('.skill-description-column')?.textContent).to.contain('Desc A');
        expect(rows[0].querySelector('.skill-location-column')?.textContent).to.contain('/path/a');

        expect(rows[1].querySelector('.skill-name-column')?.textContent).to.contain('Skill B');
        expect(rows[1].querySelector('.skill-description-column')?.textContent).to.contain('Desc B');
        expect(rows[1].querySelector('.skill-location-column')?.textContent).to.contain('/path/b');
    });

    it('clicking “Open” calls opener with URI.fromFilePath(skill.location)', async () => {
        const widget = new AISkillsConfigurationWidget();

        const skills: Skill[] = [
            { name: 'Skill A', description: 'Desc A', location: '/path/a' } as Skill
        ];

        const onSkillsChangedEmitter = new Emitter<void>();
        const skillService: Partial<SkillService> = {
            getSkills: () => skills,
            onSkillsChanged: onSkillsChangedEmitter.event
        };
        (widget as unknown as { skillService: SkillService }).skillService = skillService as SkillService;

        let openedUri: URI | undefined;
        const opener: OpenHandler = {
            id: 'test-opener',
            canHandle: async () => 1,
            open: async (uri: URI) => { openedUri = uri; }
        };
        const openerService: Partial<OpenerService> = {
            getOpener: async () => opener,
            // The widget calls `open(openerService, uri)` which internally uses `getOpener`.
            // Provide `getOpeners` as well in case other code paths expect it.
            getOpeners: async () => [opener]
        };
        (widget as unknown as { openerService: OpenerService }).openerService = openerService as OpenerService;

        (widget as unknown as { init: () => void }).init();
        renderWidget(widget);

        const button = host.querySelector('button[title="Open"]');
        expect(button).not.to.equal(undefined);

        (button as HTMLButtonElement).click();

        await Promise.resolve();

        expect(openedUri?.toString()).to.equal(URI.fromFilePath('/path/a').toString());
    });
});
