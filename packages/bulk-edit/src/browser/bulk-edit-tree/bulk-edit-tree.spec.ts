// *****************************************************************************
// Copyright (C) 2021 SAP SE or an SAP affiliate company and others.
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
import * as chai from 'chai';
import { ResourceTextEdit } from '@theia/monaco-editor-core/esm/vs/editor/browser/services/bulkEditService';
import { URI as Uri } from '@theia/core/shared/vscode-uri';

let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { Container } from '@theia/core/shared/inversify';
import { BulkEditInfoNode, BulkEditTree } from './bulk-edit-tree';

const expect = chai.expect;
let bulkEditTree: BulkEditTree;
let testContainer: Container;
const fileContextsMap = new Map<string, string>();
let resourceTextEdits: ResourceTextEdit[];

disableJSDOM();

before(() => {
    disableJSDOM = enableJSDOM();

    testContainer = new Container();
    testContainer.bind(BulkEditTree).toSelf();
    bulkEditTree = testContainer.get(BulkEditTree);

    fileContextsMap.set('/c:/test1.ts', 'aaaaaaaaaaaaaaaaaaa');
    fileContextsMap.set('/c:/test2.ts', 'bbbbbbbbbbbbbbbbbbb');

    resourceTextEdits = <ResourceTextEdit[]><unknown>[
        {
            'resource': Uri.file('c:/test1.ts'),
            'textEdit': {
                'text': 'AAAAA', 'range': { 'startLineNumber': 1, 'startColumn': 5, 'endLineNumber': 1, 'endColumn': 10 }
            }
        },
        {
            'resource': Uri.file('c:/test2.ts'),
            'textEdit': {
                'text': 'BBBBBB', 'range': { 'startLineNumber': 1, 'startColumn': 3, 'endLineNumber': 1, 'endColumn': 8 }
            }
        }
    ];
});

after(() => {
    disableJSDOM();
});

describe('bulk-edit-tree', () => {
    it('initialize tree', () => {
        bulkEditTree.initTree(resourceTextEdits, fileContextsMap);
        expect((bulkEditTree.root as BulkEditInfoNode).children.length).is.equal(2);
    });
});
