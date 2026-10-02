// *****************************************************************************
// Copyright (C) 2026 Eclipse Theia contributors.
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

// `quick-file-select-service.ts` imports from the `@theia/core/lib/browser`
// barrel, which transitively pulls in `@lumino/widgets` (application shell,
// etc.). Those modules touch `document` at `require()` time, which crashes
// under plain Node/mocha. `enableJSDOM()` must run *before* the import below
// so a DOM exists by the time those transitive requires execute.
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

// `quick-file-select-service.ts` also imports `WorkspaceService`, whose
// import chain eagerly evaluates `FrontendApplicationConfigProvider.get()`
// at module load time (see window-title-updater.ts). That call throws
// unconditionally if `.set()` was never called — this has nothing to do
// with jsdom/window state, since the provider stores its config on the
// process-wide `globalThis` (keyed by a private Symbol), not on `window`.
// It only needs to be set once, before the import below.
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { FileQuickPickItem, QuickFileSelectService } from './quick-file-select-service';

disableJSDOM();

/** Exposes the protected `compareItems` for direct unit testing. */
class TestableQuickFileSelectService extends QuickFileSelectService {
    public testCompareItems(left: FileQuickPickItem, right: FileQuickPickItem, fileFilter: string): number {
        return this.compareItems(left, right, fileFilter);
    }
}

function toItem(label: string, uriString: string): FileQuickPickItem {
    return {
        label,
        uri: new URI(uriString)
    } as FileQuickPickItem;
}

describe('QuickFileSelectService#compareItems', () => {

    // Re-enabling jsdom here only needs to restore `window`/`document` for
    // whatever the service touches during construction/execution. It does
    // NOT need to re-set FrontendApplicationConfigProvider — that config
    // lives on `globalThis` and was already set once above, for the whole
    // process.
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let service: TestableQuickFileSelectService;

    beforeEach(() => {
        service = new TestableQuickFileSelectService();
    });

    it('ranks an exact full-path match above unrelated substring matches (#17921)', () => {
        const fileFilter = 'packages/plugin-ext/src/main/browser/webview/webview.ts';

        const exactMatch = toItem(
            'webview.ts',
            'file:///home/user/dev/theia/packages/plugin-ext/src/main/browser/webview/webview.ts'
        );
        const candidates = [
            toItem(
                'electron-webview-widget-factory.ts',
                'file:///home/user/dev/theia/packages/plugin-ext/src/electron-browser/webview/electron-webview-widget-factory.ts'
            ),
            toItem(
                'webview-context-keys.ts',
                'file:///home/user/dev/theia/packages/plugin-ext/src/main/browser/webview/webview-context-keys.ts'
            ),
            toItem(
                'webview-environment.ts',
                'file:///home/user/dev/theia/packages/plugin-ext/src/main/browser/webview/webview-environment.ts'
            ),
            toItem(
                'webview-frontend-preference-contribution.ts',
                'file:///home/user/dev/theia/packages/plugin-ext/src/main/browser/webview/webview-frontend-preference-contribution.ts'
            ),
            exactMatch
        ];

        const sorted = candidates.slice().sort((a, b) => service.testCompareItems(a, b, fileFilter));

        expect(sorted[0]).to.equal(
            exactMatch,
            `Expected exact match "${exactMatch.label}" to rank first, got "${sorted[0].label}"`
        );
    });

    it('does not change ranking for an ordinary short basename query (no regression)', () => {
        const fileFilter = 'webview';

        const items = [
            toItem('electron-webview-widget-factory.ts', 'file:///a/electron-webview-widget-factory.ts'),
            toItem('webview-context-keys.ts', 'file:///a/webview-context-keys.ts'),
            toItem('webview.ts', 'file:///a/webview.ts')
        ];

        const sorted = items.slice().sort((a, b) => service.testCompareItems(a, b, fileFilter));
        const labels = sorted.map(i => i.label);

        // Snapshot of the pre-existing short-query ranking behavior. This guards
        // against the #17921 fix (reordering compareByPathScore) accidentally
        // changing ranking for ordinary basename queries.
        expect(labels).to.deep.equal([
            'electron-webview-widget-factory.ts',
            'webview-context-keys.ts',
            'webview.ts'
        ]);
    });
});
