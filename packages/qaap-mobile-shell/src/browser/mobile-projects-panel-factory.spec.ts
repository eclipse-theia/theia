// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import type { CommandRegistry } from '@theia/core/lib/common/command';
import type {
    MobileProjectsPanelFactory as MobileProjectsPanelFactoryType,
    MobileProjectsPanelFactoryDelegate,
    MobileProjectsPanelFactoryDeps,
} from './mobile-projects-panel-factory';
import type { MobileProjectsService } from './mobile-projects-service';

describe('mobile-projects-panel-factory', () => {

    let MobileProjectsPanelFactory: typeof MobileProjectsPanelFactoryType;
    let disableJSDOM: (() => void) | undefined;

    before(() => {
        disableJSDOM = enableJSDOM();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        MobileProjectsPanelFactory = require('./mobile-projects-panel-factory').MobileProjectsPanelFactory;
    });

    after(() => {
        disableJSDOM?.();
    });

    const createFactory = (): {
        factory: MobileProjectsPanelFactoryType;
        delegateCalls: string[];
    } => {
        const delegateCalls: string[] = [];
        const delegate: MobileProjectsPanelFactoryDelegate = {
            onProjectOpen: () => { delegateCalls.push('onProjectOpen'); },
            onProjectOpenInIde: () => { delegateCalls.push('onProjectOpenInIde'); },
            onDismiss: () => { delegateCalls.push('onDismiss'); },
            onWorkspaceOpened: () => { delegateCalls.push('onWorkspaceOpened'); },
            onProjectsChanged: () => { delegateCalls.push('onProjectsChanged'); },
            onCurrentProjectActivated: () => { delegateCalls.push('onCurrentProjectActivated'); },
            onResumePreview: () => { delegateCalls.push('onResumePreview'); },
            onOpenAgentOnTask: () => { delegateCalls.push('onOpenAgentOnTask'); },
            onOpenPullRequest: () => { delegateCalls.push('onOpenPullRequest'); },
            onShowAgentsHub: () => { delegateCalls.push('onShowAgentsHub'); },
            onShowRoutinesHub: () => { delegateCalls.push('onShowRoutinesHub'); },
            onHubLandingViewChanged: () => { delegateCalls.push('onHubLandingViewChanged'); },
            onEnterActiveTranscript: () => { delegateCalls.push('onEnterActiveTranscript'); },
            onExitActiveTranscript: () => { delegateCalls.push('onExitActiveTranscript'); },
            openWorkHubPreferencesSheet: async () => { delegateCalls.push('openWorkHubPreferencesSheet'); },
            openWorkHubAiConfigurationSheet: async () => { delegateCalls.push('openWorkHubAiConfigurationSheet'); },
        };
        const deps = {
            projectsService: {} as MobileProjectsService,
            commands: {} as CommandRegistry,
        } as MobileProjectsPanelFactoryDeps;
        const factory = new MobileProjectsPanelFactory({ deps, delegate });
        return { factory, delegateCalls };
    };

    it('create builds a home-mode panel', () => {
        const { factory } = createFactory();
        const panel = factory.create(true);
        expect(panel.isHomeMode()).to.equal(true);
        expect(panel.node.classList.contains('theia-mod-home')).to.equal(true);
    });

    it('create builds a sheet-mode panel', () => {
        const { factory } = createFactory();
        const panel = factory.create(false);
        expect(panel.isHomeMode()).to.equal(false);
        expect(panel.node.getAttribute('role')).to.equal('dialog');
    });
});
