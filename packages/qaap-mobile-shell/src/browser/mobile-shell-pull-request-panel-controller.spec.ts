// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
import type { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import type {
    MobileShellPullRequestPanelController as MobileShellPullRequestPanelControllerType,
    MobileShellPullRequestPanelHost,
} from './mobile-shell-pull-request-panel-controller';

describe('mobile-shell-pull-request-panel-controller', () => {

    let MobileShellPullRequestPanelController: typeof MobileShellPullRequestPanelControllerType;
    let disableJSDOM: (() => void) | undefined;

    before(() => {
        disableJSDOM = enableJSDOM();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        MobileShellPullRequestPanelController = require('./mobile-shell-pull-request-panel-controller').MobileShellPullRequestPanelController;
    });

    after(() => {
        disableJSDOM?.();
    });

    const createController = (): {
        controller: MobileShellPullRequestPanelControllerType;
        host: MobileShellPullRequestPanelHost & { calls: string[] };
        shellNode: HTMLElement;
    } => {
        const calls: string[] = [];
        const shellNode = document.createElement('div');
        document.body.append(shellNode);
        const shell = {
            node: shellNode,
            isExpanded: () => false,
            collapsePanel: async () => undefined,
        } as unknown as ApplicationShell;
        const host = {
            calls,
            scheduleSnapAndUiRefresh: () => { calls.push('scheduleSnapAndUiRefresh'); },
            refreshBottomBar: () => { calls.push('refreshBottomBar'); },
            dismissSheetsAsync: async () => { calls.push('dismissSheetsAsync'); },
            hideProjectsPanel: () => { calls.push('hideProjectsPanel'); },
        };
        const controller = new MobileShellPullRequestPanelController({ host, shell });
        return { controller, host, shellNode };
    };

    it('isPullRequestPanelShown detects visible PR overlay nodes', () => {
        const { controller, shellNode } = createController();
        expect(controller.isPullRequestPanelShown()).to.equal(false);
        const pr = document.createElement('div');
        pr.className = 'theia-mobile-pr theia-mod-visible';
        shellNode.append(pr);
        expect(controller.isPullRequestPanelShown()).to.equal(true);
    });

    it('removeAllMobilePrPanelsFromShell clears stacked PR nodes', () => {
        const { controller, shellNode } = createController();
        shellNode.append(
            document.createElement('div'),
            (() => {
                const node = document.createElement('div');
                node.className = 'theia-mobile-pr';
                return node;
            })(),
        );
        controller.removeAllMobilePrPanelsFromShell();
        expect(shellNode.querySelectorAll('.theia-mobile-pr').length).to.equal(0);
    });

    it('togglePullRequestPanel closes an already visible sheet', async () => {
        const { controller, host, shellNode } = createController();
        const pr = document.createElement('div');
        pr.className = 'theia-mobile-pr theia-mod-visible';
        shellNode.append(pr);
        await controller.togglePullRequestPanel();
        expect(host.calls).to.include('scheduleSnapAndUiRefresh');
        expect(controller.isPullRequestPanelShown()).to.equal(false);
    });

    it('togglePullRequestPanel opens after hiding projects and side sheets', async () => {
        const { controller, host } = createController();
        await controller.togglePullRequestPanel();
        expect(host.calls).to.include('hideProjectsPanel');
        expect(host.calls).to.include('dismissSheetsAsync');
        expect(host.calls).to.include('refreshBottomBar');
        expect(controller.isPullRequestPanelShown()).to.equal(true);
    });
});
