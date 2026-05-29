// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    countCatalogItems,
    filterCatalogSections,
    QAAP_WORK_HUB_WORKFLOWS,
} from './mobile-work-hub-catalog';

describe('mobile-work-hub-catalog', () => {

    it('filters workflows by title and search text', () => {
        const filtered = filterCatalogSections(QAAP_WORK_HUB_WORKFLOWS, 'triage');
        expect(filtered).to.have.lengthOf(1);
        expect(filtered[0].id).to.equal('agentic');
        expect(filtered[0].items).to.have.lengthOf(1);
        expect(filtered[0].items[0].id).to.equal('workflow-inbox');
    });

    it('returns all workflows when query is empty', () => {
        const filtered = filterCatalogSections(QAAP_WORK_HUB_WORKFLOWS, '   ');
        expect(countCatalogItems(filtered)).to.equal(countCatalogItems(QAAP_WORK_HUB_WORKFLOWS));
    });
});
