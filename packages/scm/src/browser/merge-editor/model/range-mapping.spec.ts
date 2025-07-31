// *****************************************************************************
// Copyright (C) 2025 1C-Soft LLC and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// copied and modified from https://github.com/microsoft/vscode/blob/1.96.3/src/vs/workbench/contrib/mergeEditor/test/browser/mapping.test.ts

import { expect } from 'chai';
import { Range } from '@theia/core/shared/vscode-languageserver-protocol';
import { DocumentRangeMap, RangeMapping } from './range-mapping';

describe('document-range-map', () => {

    it('project', () => {
        const documentRangeMap = new DocumentRangeMap([
            new RangeMapping(Range.create(2, 4, 2, 6), Range.create(2, 4, 2, 7)),
            new RangeMapping(Range.create(3, 2, 4, 3), Range.create(3, 2, 6, 4)),
            new RangeMapping(Range.create(4, 5, 4, 7), Range.create(6, 6, 6, 9)),
        ]);

        const project = (line: number, character: number) =>
            documentRangeMap.projectPosition({ line, character }).toString();

        expect(project(1, 1)).to.be.equal('[1:1, 1:1) -> [1:1, 1:1)');
        expect(project(2, 3)).to.be.equal('[2:3, 2:3) -> [2:3, 2:3)');
        expect(project(2, 4)).to.be.equal('[2:4, 2:6) -> [2:4, 2:7)');
        expect(project(2, 5)).to.be.equal('[2:4, 2:6) -> [2:4, 2:7)');
        expect(project(2, 6)).to.be.equal('[2:6, 2:6) -> [2:7, 2:7)');
        expect(project(2, 7)).to.be.equal('[2:7, 2:7) -> [2:8, 2:8)');
        expect(project(3, 1)).to.be.equal('[3:1, 3:1) -> [3:1, 3:1)');
        expect(project(3, 2)).to.be.equal('[3:2, 4:3) -> [3:2, 6:4)');
        expect(project(4, 2)).to.be.equal('[3:2, 4:3) -> [3:2, 6:4)');
        expect(project(4, 3)).to.be.equal('[4:3, 4:3) -> [6:4, 6:4)');
        expect(project(4, 4)).to.be.equal('[4:4, 4:4) -> [6:5, 6:5)');
        expect(project(4, 5)).to.be.equal('[4:5, 4:7) -> [6:6, 6:9)');
    });

});
