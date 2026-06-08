// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import { setMobileLandingHubListChrome } from './mobile-projects-open';
import type { MobileProjectsHubView } from './mobile-projects-types';

/** Panel surface for FAB visibility and landing hub list chrome. */
export interface MobileProjectsHubListChromeHost {
    hubView: MobileProjectsHubView;
    expandedId: string | undefined;
    root: HTMLElement;
    newFabBtn: HTMLButtonElement;
    homeMode: boolean;
    visible: boolean;

    shouldUseAgentsHubLanding(): boolean;
}

/** New-repository FAB and bottom-nav chrome for hub list vs expanded project. */
export class MobileProjectsHubListChromeUi {

    constructor(protected readonly host: MobileProjectsHubListChromeHost) { }

    updateNewFabVisibility(): void {
        const repoExpanded = this.host.hubView === 'repos' && this.host.expandedId !== undefined;
        this.host.root.classList.toggle('theia-mod-repo-expanded', repoExpanded);
        const showRepoFab = this.host.hubView === 'repos' && !repoExpanded;
        const showRoutineFab = this.host.hubView === 'routines';
        const showFab = showRepoFab || showRoutineFab;
        this.host.newFabBtn.hidden = !showFab;
        this.host.newFabBtn.setAttribute('aria-hidden', showFab ? 'false' : 'true');
        this.host.newFabBtn.title = showRoutineFab
            ? nls.localize('qaap/mobileProjects/newRoutine', 'New routine')
            : nls.localize('qaap/mobileProjects/newRepository', 'Add repository');
        this.host.newFabBtn.setAttribute('aria-label', this.host.newFabBtn.title);
    }

    /**
     * Landing hub list (no expanded project): show the global bottom nav. Hide it while a project
     * row is expanded so the user can focus on chats and the sticky composer.
     */
    syncLandingHubListChrome(): void {
        if (!this.host.homeMode || this.host.shouldUseAgentsHubLanding()) {
            this.host.root.classList.remove('theia-mod-hub-list-chrome');
            setMobileLandingHubListChrome(false);
            return;
        }
        const hubList = this.host.visible && this.host.expandedId === undefined;
        this.host.root.classList.toggle('theia-mod-hub-list-chrome', hubList);
        setMobileLandingHubListChrome(hubList);
    }

}
