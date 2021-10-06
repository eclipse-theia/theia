/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import URI from '@theia/core/lib/common/uri';
import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { Diagnostic, Range, DiagnosticSeverity } from '@theia/core/shared/vscode-languageserver-protocol';
import { Event } from '@theia/core/lib/common/event';
import { Marker } from '../../common/marker';
import { MarkerManager } from '../marker-manager';
import { MarkerNode, MarkerOptions } from '../marker-tree';
import { PROBLEM_OPTIONS } from './problem-container';
import { ProblemManager } from './problem-manager';
import { ProblemTree } from './problem-tree-model';
import { FileService } from '@theia/filesystem/lib/browser/file-service';

disableJSDOM();

let problemTree: ProblemTree;

before(() => {
    disableJSDOM = enableJSDOM();
    const testContainer = new Container();

    testContainer.bind(MarkerManager).toSelf().inSingletonScope();
    testContainer.bind(ProblemManager).toSelf();
    testContainer.bind(MarkerOptions).toConstantValue(PROBLEM_OPTIONS);
    testContainer.bind(FileService).toConstantValue(<FileService>{
        onDidFilesChange: Event.None
    });

    testContainer.bind(ProblemTree).toSelf().inSingletonScope();
    problemTree = testContainer.get<ProblemTree>(ProblemTree);
});

after(() => {
    disableJSDOM();
});

describe('Problem Tree', () => {

    describe('#sortMarkers', () => {
        describe('should sort markers based on the highest severity', () => {
            it('should sort errors higher than warnings', () => {
                const markerA = createMockMarker({ start: { line: 0, character: 10 }, end: { line: 0, character: 10 } }, DiagnosticSeverity.Error);
                const markerB = createMockMarker({ start: { line: 0, character: 10 }, end: { line: 0, character: 10 } }, DiagnosticSeverity.Warning);
                const nodeA = createMockMarkerNode(markerA);
                const nodeB = createMockMarkerNode(markerB);
                expect(problemTree['sortMarkers'](nodeA, nodeB)).equals(-1);
                expect(problemTree['sortMarkers'](nodeB, nodeA)).equals(1);
            });
            it('should sort errors higher than infos', () => {
                const markerA = createMockMarker({ start: { line: 0, character: 10 }, end: { line: 0, character: 10 } }, DiagnosticSeverity.Error);
                const markerB = createMockMarker({ start: { line: 0, character: 10 }, end: { line: 0, character: 10 } }, DiagnosticSeverity.Information);
                const nodeA = createMockMarkerNode(markerA);
                const nodeB = createMockMarkerNode(markerB);
                expect(problemTree['sortMarkers'](nodeA, nodeB)).equals(-2);
                expect(problemTree['sortMarkers'](nodeB, nodeA)).equals(2);
            });
            it('should sort errors higher than hints', () => {
                const markerA = createMockMarker({ start: { line: 0, character: 10 }, end: { line: 0, character: 10 } }, DiagnosticSeverity.Error);
                const markerB = createMockMarker({ start: { line: 0, character: 10 }, end: { line: 0, character: 10 } }, DiagnosticSeverity.Hint);
                const nodeA = createMockMarkerNode(markerA);
                const nodeB = createMockMarkerNode(markerB);
                expect(problemTree['sortMarkers'](nodeA, nodeB)).equals(-3);
                expect(problemTree['sortMarkers'](nodeB, nodeA)).equals(3);
            });
            it('should sort warnings higher than infos', () => {
                const markerA = createMockMarker({ start: { line: 0, character: 10 }, end: { line: 0, character: 10 } }, DiagnosticSeverity.Warning);
                const markerB = createMockMarker({ start: { line: 0, character: 10 }, end: { line: 0, character: 10 } }, DiagnosticSeverity.Information);
                const nodeA = createMockMarkerNode(markerA);
                const nodeB = createMockMarkerNode(markerB);
                expect(problemTree['sortMarkers'](nodeA, nodeB)).equals(-1);
                expect(problemTree['sortMarkers'](nodeB, nodeA)).equals(1);
            });
            it('should sort warnings higher than hints', () => {
                const markerA = createMockMarker({ start: { line: 0, character: 10 }, end: { line: 0, character: 10 } }, DiagnosticSeverity.Warning);
                const markerB = createMockMarker({ start: { line: 0, character: 10 }, end: { line: 0, character: 10 } }, DiagnosticSeverity.Hint);
                const nodeA = createMockMarkerNode(markerA);
                const nodeB = createMockMarkerNode(markerB);
                expect(problemTree['sortMarkers'](nodeA, nodeB)).equals(-2);
                expect(problemTree['sortMarkers'](nodeB, nodeA)).equals(2);
            });
            it('should sort infos higher than hints', () => {
                const markerA = createMockMarker({ start: { line: 0, character: 10 }, end: { line: 0, character: 10 } }, DiagnosticSeverity.Information);
                const markerB = createMockMarker({ start: { line: 0, character: 10 }, end: { line: 0, character: 10 } }, DiagnosticSeverity.Hint);
                const nodeA = createMockMarkerNode(markerA);
                const nodeB = createMockMarkerNode(markerB);
                expect(problemTree['sortMarkers'](nodeA, nodeB)).equals(-1);
                expect(problemTree['sortMarkers'](nodeB, nodeA)).equals(1);
            });
        });

        it('should sort markers based on lowest line number if their severities are equal', () => {
            const markerA = createMockMarker({ start: { line: 1, character: 10 }, end: { line: 1, character: 20 } }, DiagnosticSeverity.Error);
            const markerB = createMockMarker({ start: { line: 5, character: 10 }, end: { line: 5, character: 20 } }, DiagnosticSeverity.Error);
            const nodeA = createMockMarkerNode(markerA);
            const nodeB = createMockMarkerNode(markerB);
            expect(problemTree['sortMarkers'](nodeA, nodeB)).equals(-4);
            expect(problemTree['sortMarkers'](nodeB, nodeA)).equals(4);
        });

        it('should sort markers based on lowest column number if their severities and line numbers are equal', () => {
            const markerA = createMockMarker({ start: { line: 1, character: 10 }, end: { line: 1, character: 10 } }, DiagnosticSeverity.Error);
            const markerB = createMockMarker({ start: { line: 1, character: 20 }, end: { line: 1, character: 20 } }, DiagnosticSeverity.Error);
            const nodeA = createMockMarkerNode(markerA);
            const nodeB = createMockMarkerNode(markerB);
            expect(problemTree['sortMarkers'](nodeA, nodeB)).equals(-10);
            expect(problemTree['sortMarkers'](nodeB, nodeA)).equals(10);
        });

        it('should sort markers based on owner if their severities, line numbers and columns are equal', () => {
            const markerA = createMockMarker({ start: { line: 1, character: 10 }, end: { line: 1, character: 10 } }, DiagnosticSeverity.Error, 'A');
            const markerB = createMockMarker({ start: { line: 1, character: 10 }, end: { line: 1, character: 10 } }, DiagnosticSeverity.Error, 'B');
            const nodeA = createMockMarkerNode(markerA);
            const nodeB = createMockMarkerNode(markerB);
            expect(problemTree['sortMarkers'](nodeA, nodeB)).equals(-1);
            expect(problemTree['sortMarkers'](nodeB, nodeA)).equals(1);
        });

        it('should not sort if markers are equal', () => {
            const markerA = createMockMarker({ start: { line: 0, character: 10 }, end: { line: 0, character: 10 } }, DiagnosticSeverity.Error);
            const markerB = createMockMarker({ start: { line: 0, character: 10 }, end: { line: 0, character: 10 } }, DiagnosticSeverity.Error);
            const nodeA = createMockMarkerNode(markerA);
            const nodeB = createMockMarkerNode(markerB);
            expect(problemTree['sortMarkers'](nodeA, nodeB)).equals(0);
            expect(problemTree['sortMarkers'](nodeB, nodeA)).equals(0);
        });
    });

});

/**
 * Create a mock marker node with the given diagnostic marker.
 * @param marker the diagnostic marker.
 *
 * @returns a mock marker node.
 */
function createMockMarkerNode(marker: Marker<Diagnostic>): MarkerNode {
    return {
        id: 'id',
        name: 'marker',
        parent: undefined,
        selected: false,
        uri: new URI(''),
        marker
    };
}

/**
 * Create a mock diagnostic marker.
 * @param range the diagnostic range.
 * @param severity the diagnostic severity.
 * @param owner the optional owner of the diagnostic
 *
 * @returns a mock diagnostic marker.
 */
function createMockMarker(range: Range, severity: DiagnosticSeverity, owner?: string): Readonly<Marker<Diagnostic>> {
    const data: Diagnostic = {
        range: range,
        severity: severity,
        message: 'message'
    };
    return Object.freeze({
        uri: 'uri',
        kind: 'marker',
        owner: owner ?? 'owner',
        data
    });
}
