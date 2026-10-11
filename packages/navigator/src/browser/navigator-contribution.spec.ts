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
    let fileClipboardText: string | undefined;
    let systemClipboardReads: number;
    let pastedTexts: string[];
    let pasteError: Error | undefined;
    let errorMessages: string[];
    let selectedNodes: FileStatNode[];

    function createNavigatorWidgetStub(): FileNavigatorWidget {
        return {
            canPasteFiles: (raw?: string): boolean => raw !== '' && selectedNodes.length > 0,
            pasteFiles: (raw: string): Promise<boolean> => {
                pastedTexts.push(raw);
                return pasteError ? Promise.reject(pasteError) : Promise.resolve(true);
            }
        } as unknown as FileNavigatorWidget;
    }

    beforeEach(() => {
        clipboardText = '';
        fileClipboardText = undefined;
        systemClipboardReads = 0;
        pastedTexts = [];
        pasteError = undefined;
        errorMessages = [];
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
                readText: async (): Promise<string> => {
                    systemClipboardReads++;
                    return clipboardText;
                }
            },
            fileClipboard: {
                get: (): string | undefined => fileClipboardText
            },
            messageService: {
                error: (message: string): void => {
                    errorMessages.push(message);
                }
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

        it('should prefer the file clipboard over the system clipboard', async () => {
            fileClipboardText = 'file:///workspace/copied-in-app.txt';
            clipboardText = 'file:///workspace/copied-outside.txt';
            await contribution['pasteIntoNavigator']();
            expect(pastedTexts).to.deep.equal(['file:///workspace/copied-in-app.txt']);
            expect(systemClipboardReads).to.equal(0);
        });

        it('should fall back to the system clipboard if the file clipboard is empty', async () => {
            clipboardText = 'file:///workspace/copied-outside.txt';
            await contribution['pasteIntoNavigator']();
            expect(pastedTexts).to.deep.equal(['file:///workspace/copied-outside.txt']);
            expect(systemClipboardReads).to.equal(1);
        });

        it('should report a failed paste instead of rejecting unhandled', async () => {
            clipboardText = 'file:///workspace/a.txt';
            pasteError = new Error('Parent of file has to be a FileStatNode');
            await contribution['pasteIntoNavigator']();
            expect(errorMessages).to.deep.equal(['Parent of file has to be a FileStatNode']);
        });
    });
});
