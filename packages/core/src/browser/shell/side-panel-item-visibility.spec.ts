// *****************************************************************************
// Copyright (C) 2026 JuliaHub and others.
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
import { Container, injectable } from 'inversify';
import { LocalStorageService } from '../storage-service';
import { MockStorageService } from '../test/mock-storage-service';
import { SidePanelItemVisibilityImpl } from './side-panel-item-visibility';

const STORAGE_KEY = SidePanelItemVisibilityImpl.STORAGE_KEY;

@injectable()
class DebugHiddenByDefault extends SidePanelItemVisibilityImpl {
    protected override isHiddenByDefault(widgetId: string): boolean {
        return widgetId === 'debug';
    }
}

describe('SidePanelItemVisibility', () => {

    let storage: MockStorageService;

    async function create(implementation: typeof SidePanelItemVisibilityImpl = SidePanelItemVisibilityImpl): Promise<SidePanelItemVisibilityImpl> {
        const container = new Container();
        container.bind(LocalStorageService).toConstantValue(storage as unknown as LocalStorageService);
        container.bind(implementation).toSelf();
        const visibility = container.get(implementation);
        await visibility.ready;
        return visibility;
    }

    beforeEach(() => {
        storage = new MockStorageService();
    });

    it('shows items by default', async () => {
        const visibility = await create();
        expect(visibility.isHidden('explorer-view-container')).to.be.false;
    });

    it('persists only explicit choices and restores them', async () => {
        const visibility = await create();
        const changed: string[] = [];
        visibility.onDidChange(id => changed.push(id));

        visibility.setHidden('explorer-view-container', true);
        visibility.setHidden('explorer-view-container', true);

        expect(changed).to.deep.equal(['explorer-view-container']);
        expect(storage.data.get(STORAGE_KEY)).to.deep.equal({ 'explorer-view-container': true });
        expect((await create()).isHidden('explorer-view-container')).to.be.true;
    });

    it('lets an explicit choice override the default', async () => {
        const visibility = await create(DebugHiddenByDefault);
        expect(visibility.isHidden('debug')).to.be.true;

        visibility.setHidden('debug', false);

        expect(visibility.isHidden('debug')).to.be.false;
        expect(storage.data.get(STORAGE_KEY)).to.deep.equal({ debug: false });
    });

    it('falls back to the defaults on reset and clears storage', async () => {
        const visibility = await create(DebugHiddenByDefault);
        visibility.setHidden('debug', false);
        visibility.setHidden('scm-view-container', true);
        let resets = 0;
        visibility.onDidReset(() => resets++);

        visibility.reset();

        expect(visibility.isHidden('debug')).to.be.true;
        expect(visibility.isHidden('scm-view-container')).to.be.false;
        expect(storage.data.get(STORAGE_KEY)).to.be.undefined;
        expect(resets).to.equal(1);
    });
});
