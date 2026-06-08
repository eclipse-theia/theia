// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';
import {
    filterCatalogSections,
    QAAP_WORK_HUB_WORKFLOWS,
    type WorkHubCatalogAction,
    type WorkHubCatalogItem,
    type WorkHubCatalogSection,
} from '../common/mobile-work-hub-catalog';
import { bindCatalogCardTapFeedback } from './qaap-catalog-card-tap-feedback';

/** Panel surface for the Workflows (catalog) hub tab. */
export interface MobileProjectsHubCatalogHost {
    query: string;
    scroll: HTMLElement;

    renderSubtitle(): void;
    runCatalogAction(action: WorkHubCatalogAction): Promise<void>;
}

/** Workflows catalog cards grouped by section. */
export class MobileProjectsHubCatalogUi {

    constructor(protected readonly host: MobileProjectsHubCatalogHost) { }

    renderCatalogHubView(): void {
        const sections = filterCatalogSections(QAAP_WORK_HUB_WORKFLOWS, this.host.query);
        if (sections.length === 0) {
            this.host.scroll.append(this.createCatalogEmptyState());
            this.host.renderSubtitle();
            return;
        }
        const catalog = document.createElement('div');
        catalog.className = 'theia-mobile-hub-catalog';
        for (const section of sections) {
            catalog.append(this.createCatalogSection(section));
        }
        this.host.scroll.append(catalog);
        this.host.renderSubtitle();
    }

    createCatalogSection(section: WorkHubCatalogSection): HTMLElement {
        const block = document.createElement('section');
        block.className = 'theia-mobile-hub-catalog-section';

        const head = document.createElement('div');
        head.className = 'theia-mobile-hub-catalog-section-head';
        const title = document.createElement('h2');
        title.className = 'theia-mobile-hub-catalog-section-title';
        title.textContent = section.title;
        const count = document.createElement('span');
        count.className = 'theia-mobile-hub-catalog-section-count';
        count.textContent = String(section.items.length);
        head.append(title, count);

        const list = document.createElement('div');
        list.className = 'theia-mobile-hub-catalog-cards';
        for (const item of section.items) {
            list.append(this.createCatalogCard(item));
        }

        block.append(head, list);
        return block;
    }

    createCatalogCard(item: WorkHubCatalogItem): HTMLElement {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'theia-mobile-hub-catalog-card';
        if (item.accent) {
            card.style.setProperty('--qaap-hub-catalog-accent', item.accent);
        }

        const icon = document.createElement('span');
        icon.className = `theia-mobile-hub-catalog-card-icon codicon ${item.iconClass}`;
        icon.setAttribute('aria-hidden', 'true');

        const body = document.createElement('div');
        body.className = 'theia-mobile-hub-catalog-card-body';

        const title = document.createElement('span');
        title.className = 'theia-mobile-hub-catalog-card-title';
        title.textContent = item.title;

        const subtitle = document.createElement('span');
        subtitle.className = 'theia-mobile-hub-catalog-card-subtitle';
        subtitle.textContent = item.subtitle;

        body.append(title, subtitle);

        if (item.progress !== undefined) {
            const progressWrap = document.createElement('div');
            progressWrap.className = 'theia-mobile-hub-catalog-card-progress';
            progressWrap.setAttribute('role', 'progressbar');
            progressWrap.setAttribute('aria-valuemin', '0');
            progressWrap.setAttribute('aria-valuemax', '100');
            const percent = Math.round(Math.max(0, Math.min(1, item.progress)) * 100);
            progressWrap.setAttribute('aria-valuenow', String(percent));
            const bar = document.createElement('span');
            bar.className = 'theia-mobile-hub-catalog-card-progress-bar';
            bar.style.width = `${percent}%`;
            progressWrap.append(bar);
            body.append(progressWrap);
        }

        if (item.meta) {
            const meta = document.createElement('span');
            meta.className = 'theia-mobile-hub-catalog-card-meta';
            meta.textContent = item.meta;
            body.append(meta);
        }

        const chevron = document.createElement('span');
        chevron.className = 'theia-mobile-hub-catalog-card-chevron codicon codicon-chevron-right';
        chevron.setAttribute('aria-hidden', 'true');

        card.append(icon, body, chevron);
        bindCatalogCardTapFeedback(card);
        card.addEventListener('click', () => { void this.host.runCatalogAction(item.action); });
        return card;
    }

    createCatalogEmptyState(): HTMLElement {
        const empty = document.createElement('div');
        empty.className = 'theia-mobile-projects-empty theia-mod-catalog-empty';
        const title = document.createElement('strong');
        title.textContent = nls.localize('qaap/mobileProjects/workflowsEmpty', 'No workflows match your search');
        const body = document.createElement('span');
        body.textContent = nls.localize(
            'qaap/mobileProjects/workflowsEmptyBody',
            'Try another keyword or clear the search field.',
        );
        empty.append(title, body);
        return empty;
    }
}
