// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Widget } from '@theia/core/lib/browser';
import { OpenerService } from '@theia/core/lib/browser/opener-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { WorkspacePreferences } from '@theia/workspace/lib/common';
import { FileStatNode } from '@theia/filesystem/lib/browser';
import { FileNavigatorContribution } from './navigator-contribution';
import { FileNavigatorPreferences } from '../common/navigator-preferences';
import { FileNavigatorFilter } from './navigator-filter';
import { FileNavigatorWidget } from './navigator-widget';

disableJSDOM();

describe('FileNavigatorContribution', () => {

    let contribution: FileNavigatorContribution;
    let navigatorWidget: FileNavigatorWidget | undefined;
    let currentWidget: Widget | undefined;
    let clipboardText: string;
    let pastedTexts: string[];
    let selectedNodes: FileStatNode[];

    function createNavigatorWidgetStub(): FileNavigatorWidget {
        return {
            model: {
                get selectedFileStatNodes(): FileStatNode[] {
                    return selectedNodes;
                }
            },
            pasteFiles: (raw: string): boolean => {
                pastedTexts.push(raw);
                return true;
            }
        } as unknown as FileNavigatorWidget;
    }

    beforeEach(() => {
        clipboardText = '';
        pastedTexts = [];
        selectedNodes = [];
        navigatorWidget = createNavigatorWidgetStub();
        currentWidget = navigatorWidget;
        contribution = new FileNavigatorContribution(
            {} as FileNavigatorPreferences,
            {} as OpenerService,
            {} as FileNavigatorFilter,
            {} as WorkspaceService,
            {} as WorkspacePreferences
        );
        Object.assign(contribution, {
            widgetManager: {
                tryGetWidget: (): FileNavigatorWidget | undefined => navigatorWidget
            },
            shell: {
                get currentWidget(): Widget | undefined {
                    return currentWidget;
                }
            },
            clipboardService: {
                readText: async (): Promise<string> => clipboardText
            }
        });
    });

    describe('canPasteIntoNavigator', () => {

        it('should be disabled if the navigator widget has not been created', () => {
            navigatorWidget = undefined;
            expect(contribution['canPasteIntoNavigator']()).to.be.false;
        });

        it('should be disabled if the navigator is not the current widget', () => {
            selectedNodes = [{ id: 'target' } as FileStatNode];
            currentWidget = undefined;
            expect(contribution['canPasteIntoNavigator']()).to.be.false;
        });

        it('should be disabled if no paste target is selected', () => {
            expect(contribution['canPasteIntoNavigator']()).to.be.false;
        });

        it('should be enabled if the navigator is the current widget and a paste target is selected', () => {
            selectedNodes = [{ id: 'target' } as FileStatNode];
            expect(contribution['canPasteIntoNavigator']()).to.be.true;
        });
    });

    describe('pasteIntoNavigator', () => {

        it('should paste the clipboard text into the navigator', async () => {
            clipboardText = 'file:///workspace/a.txt';
            await contribution['pasteIntoNavigator']();
            expect(pastedTexts).to.deep.equal(['file:///workspace/a.txt']);
        });

        it('should not paste anything for empty clipboard text', async () => {
            await contribution['pasteIntoNavigator']();
            expect(pastedTexts).to.have.lengthOf(0);
        });
    });
});
