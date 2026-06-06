// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';

export interface StickyComposerWorkspaceBarView {
    readonly projectName: string;
    readonly branchName: string;
}

export function createStickyComposerWorkspacePill(options: {
    readonly iconClass: string;
    readonly label: string;
    readonly ariaLabel: string;
    readonly onClick: () => void;
    readonly mono?: boolean;
    readonly branch?: boolean;
}): HTMLButtonElement {
    return createWorkspacePill(options);
}

export function renderStickyComposerWorkspaceBar(options: {
    readonly view: StickyComposerWorkspaceBarView;
    readonly onOpenProject: () => void;
    readonly onOpenBranch: () => void;
    readonly includeProject?: boolean;
    readonly includeBranch?: boolean;
}): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'theia-mobile-projects-sticky-composer-workspace-bar';

    const pills: HTMLButtonElement[] = [];
    if (options.includeProject !== false) {
        pills.push(createWorkspacePill({
            iconClass: 'codicon-folder',
            label: options.view.projectName,
            ariaLabel: nls.localize('qaap/composerWorkspace/projectAria', 'Project: {0}', options.view.projectName),
            onClick: options.onOpenProject,
        }));
    }
    if (options.includeBranch !== false) {
        pills.push(createWorkspacePill({
            iconClass: 'codicon-git-branch',
            label: options.view.branchName,
            ariaLabel: nls.localize('qaap/composerWorkspace/branchAria', 'Branch: {0}', options.view.branchName),
            onClick: options.onOpenBranch,
            mono: true,
            branch: true,
        }));
    }
    bar.append(...pills);
    return bar;
}

function createWorkspacePill(options: {
    readonly iconClass: string;
    readonly label: string;
    readonly ariaLabel: string;
    readonly onClick: () => void;
    readonly mono?: boolean;
    readonly branch?: boolean;
}): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theia-mobile-projects-sticky-composer-workspace-pill';
    if (options.branch) {
        btn.classList.add('theia-mod-branch');
    }
    btn.title = options.ariaLabel;
    btn.setAttribute('aria-label', options.ariaLabel);
    btn.setAttribute('aria-haspopup', 'dialog');

    const icon = document.createElement('span');
    icon.className = `theia-mobile-projects-sticky-composer-workspace-pill-icon codicon ${options.iconClass}`;
    icon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'theia-mobile-projects-sticky-composer-workspace-pill-label';
    if (options.mono) {
        label.classList.add('theia-mod-mono');
    }
    label.textContent = options.label;

    const chevron = document.createElement('span');
    chevron.className = 'theia-mobile-projects-sticky-composer-workspace-pill-chevron codicon codicon-chevron-down';
    chevron.setAttribute('aria-hidden', 'true');

    btn.append(icon, label, chevron);
    btn.addEventListener('click', ev => {
        ev.stopPropagation();
        options.onClick();
    });
    return btn;
}
