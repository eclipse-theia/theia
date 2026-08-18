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
import URI from '@theia/core/lib/common/uri';
import { MessageService } from '@theia/core/lib/common/message-service';
import { ContextMenuRenderer, TreeProps } from '@theia/core/lib/browser';
import { FileStatNode } from '@theia/filesystem/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileNavigatorWidget } from './navigator-widget';
import { FileNavigatorModel } from './navigator-model';
import { NavigatorFileClipboard } from './navigator-file-clipboard';

disableJSDOM();

describe('FileNavigatorWidget', () => {

    const workspaceRoot = new URI('file:///workspace');
    let copiedSources: URI[];
    let selectedNodes: FileStatNode[];
    let storedClipboardContents: string[];
    let infoMessages: string[];
    let errorMessages: string[];
    let widget: FileNavigatorWidget;

    const targetNode = { id: 'target', uri: workspaceRoot } as FileStatNode;

    function createWidget(root: URI = workspaceRoot): FileNavigatorWidget {
        copiedSources = [];
        selectedNodes = [];
        storedClipboardContents = [];
        infoMessages = [];
        errorMessages = [];
        const model = {
            get selectedFileStatNodes(): FileStatNode[] {
                return selectedNodes;
            },
            copy: (source: URI, target: FileStatNode): Promise<URI> => {
                expect(target).to.equal(targetNode);
                copiedSources.push(source);
                return Promise.resolve(source);
            }
        } as unknown as FileNavigatorModel;
        const navigator = new FileNavigatorWidget({} as TreeProps, model, {} as ContextMenuRenderer);
        const workspaceService = {
            getWorkspaceRootUri: (uri: URI | undefined): URI | undefined =>
                uri && root.isEqualOrParent(uri) ? root : undefined
        } as WorkspaceService;
        const fileClipboard = {
            set: (content: string): void => {
                storedClipboardContents.push(content);
            }
        } as NavigatorFileClipboard;
        const messageService = {
            info: (message: string): void => {
                infoMessages.push(message);
            },
            error: (message: string): void => {
                errorMessages.push(message);
            }
        } as unknown as MessageService;
        Object.assign(navigator, { workspaceService, fileClipboard, messageService });
        return navigator;
    }

    let jsdomCleanup: () => void;
    before(() => {
        jsdomCleanup = enableJSDOM();
    });
    after(() => {
        jsdomCleanup();
    });

    beforeEach(() => {
        widget = createWidget();
    });

    describe('pasteFiles', () => {

        it('should not paste anything for empty clipboard text', async () => {
            selectedNodes = [targetNode];
            expect(await widget.pasteFiles('')).to.be.false;
            expect(copiedSources).to.have.lengthOf(0);
        });

        it('should not paste anything if no target node is selected', async () => {
            expect(await widget.pasteFiles('file:///workspace/some-file.txt')).to.be.false;
            expect(copiedSources).to.have.lengthOf(0);
        });

        it('should copy valid workspace URIs to the selected target', async () => {
            selectedNodes = [targetNode];
            expect(await widget.pasteFiles('file:///workspace/a.txt\nfile:///workspace/dir/b.txt')).to.be.true;
            expect(copiedSources.map(uri => uri.toString())).to.deep.equal([
                'file:///workspace/a.txt',
                'file:///workspace/dir/b.txt'
            ]);
        });

        it('should resolve only after the copies completed', async () => {
            selectedNodes = [targetNode];
            let completedCopies = 0;
            widget.model.copy = async (source: URI): Promise<URI> => {
                await new Promise(resolve => setTimeout(resolve, 5));
                completedCopies++;
                return source;
            };
            expect(await widget.pasteFiles('file:///workspace/a.txt\nfile:///workspace/b.txt')).to.be.true;
            expect(completedCopies).to.equal(2);
        });

        it('should skip blank lines, invalid URIs and URIs outside the workspace', async () => {
            selectedNodes = [targetNode];
            const raw = [
                '',
                '   ',
                'not a uri',
                'file:///outside/c.txt',
                'file:///workspace/d.txt'
            ].join('\n');
            expect(await widget.pasteFiles(raw)).to.be.true;
            expect(copiedSources.map(uri => uri.toString())).to.deep.equal(['file:///workspace/d.txt']);
            expect(infoMessages).to.have.lengthOf(0);
        });

        it('should paste files given as absolute file system paths', async () => {
            selectedNodes = [targetNode];
            expect(await widget.pasteFiles('/workspace/e.txt')).to.be.true;
            expect(copiedSources.map(uri => uri.toString())).to.deep.equal(['file:///workspace/e.txt']);
            expect(infoMessages).to.have.lengthOf(0);
        });

        it('should paste files given as Windows-style absolute paths', async () => {
            widget = createWidget(URI.fromFilePath('C:\\workspace'));
            selectedNodes = [targetNode];
            expect(await widget.pasteFiles('C:\\workspace\\sub\\f.txt')).to.be.true;
            expect(copiedSources.map(uri => uri.toString())).to.deep.equal([URI.fromFilePath('C:\\workspace\\sub\\f.txt').toString()]);
            expect(infoMessages).to.have.lengthOf(0);
        });

        it('should not paste relative paths', async () => {
            selectedNodes = [targetNode];
            expect(await widget.pasteFiles('workspace/relative.txt')).to.be.true;
            expect(copiedSources).to.have.lengthOf(0);
        });

        it('should inform the user when the clipboard contains no pastable files', async () => {
            selectedNodes = [targetNode];
            expect(await widget.pasteFiles('not a uri')).to.be.true;
            expect(copiedSources).to.have.lengthOf(0);
            expect(infoMessages).to.have.lengthOf(1);
        });

        it('should stay silent for empty clipboard text or missing paste target', async () => {
            expect(await widget.pasteFiles('file:///workspace/a.txt')).to.be.false;
            selectedNodes = [targetNode];
            expect(await widget.pasteFiles('')).to.be.false;
            expect(infoMessages).to.have.lengthOf(0);
        });
    });

    describe('asPastedFileUri', () => {

        it('should interpret UNC paths as file URIs', () => {
            const uri = widget['asPastedFileUri']('\\\\server\\share\\f.txt');
            expect(uri?.toString()).to.equal(URI.fromFilePath('\\\\server\\share\\f.txt').toString());
        });
    });

    describe('handlePaste', () => {

        function pasteEvent(text: string): ClipboardEvent & { prevented: number } {
            const event = {
                prevented: 0,
                clipboardData: { getData: () => text },
                preventDefault(): void {
                    event.prevented++;
                }
            };
            return event as unknown as ClipboardEvent & { prevented: number };
        }

        it('should consume the event only when clipboard text and a paste target are available', () => {
            const noTarget = pasteEvent('file:///workspace/a.txt');
            widget['handlePaste'](noTarget);
            expect(noTarget.prevented).to.equal(0);

            selectedNodes = [targetNode];
            const noText = pasteEvent('');
            widget['handlePaste'](noText);
            expect(noText.prevented).to.equal(0);

            const pastable = pasteEvent('file:///workspace/a.txt');
            widget['handlePaste'](pastable);
            expect(pastable.prevented).to.equal(1);
        });

        it('should report a failed paste instead of rejecting unhandled', async () => {
            selectedNodes = [targetNode];
            widget.model.copy = () => Promise.reject(new Error('Parent of file has to be a FileStatNode'));
            widget['handlePaste'](pasteEvent('file:///workspace/a.txt'));
            await new Promise(resolve => setTimeout(resolve, 0));
            expect(errorMessages).to.deep.equal(['Parent of file has to be a FileStatNode']);
        });
    });

    describe('canPasteFiles', () => {

        it('should require a paste target', () => {
            expect(widget.canPasteFiles()).to.be.false;
            selectedNodes = [targetNode];
            expect(widget.canPasteFiles()).to.be.true;
        });

        it('should reject empty clipboard text if it is already known', () => {
            selectedNodes = [targetNode];
            expect(widget.canPasteFiles('')).to.be.false;
            expect(widget.canPasteFiles('file:///workspace/a.txt')).to.be.true;
        });
    });

    describe('handleCopy', () => {

        it('should record copied URIs in the file clipboard', () => {
            const sourceNode = { id: 'source', uri: new URI('file:///workspace/a.txt') } as FileStatNode;
            selectedNodes = [sourceNode];
            const clipboardEvent = {
                clipboardData: { setData: () => undefined },
                preventDefault: () => undefined
            } as unknown as ClipboardEvent;
            widget['handleCopy'](clipboardEvent);
            expect(storedClipboardContents).to.deep.equal(['file:///workspace/a.txt']);
        });
    });
});
