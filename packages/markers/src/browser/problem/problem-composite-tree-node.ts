// *****************************************************************************
// Copyright (C) 2021 EclipseSource and others.
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

import { CompositeTreeNode } from '@theia/core/lib/browser/tree/tree';
import { MarkerInfoNode } from '../marker-tree';
import URI from '@theia/core/lib/common/uri';
import { Marker } from '../../common/marker';
import { Diagnostic, DiagnosticSeverity } from '@theia/core/shared/vscode-languageserver-protocol';
import { ProblemUtils } from './problem-utils';

export namespace ProblemCompositeTreeNode {

    export interface Child {
        node: MarkerInfoNode;
        markers: Marker<Diagnostic>[];
    }

    export function setSeverity(parent: MarkerInfoNode, markers: Marker<Diagnostic>[]): void {
        let maxSeverity: DiagnosticSeverity | undefined;
        markers.forEach(marker => {
            if (ProblemUtils.severityCompare(marker.data.severity, maxSeverity) < 0) {
                maxSeverity = marker.data.severity;
            }
        });
        parent.severity = maxSeverity;
    };

    export function addChildren(parent: CompositeTreeNode, insertChildren: ProblemCompositeTreeNode.Child[]): void {
        for (const { node, markers } of insertChildren) {
            ProblemCompositeTreeNode.setSeverity(node, markers);
        }

        const sortedInsertChildren = insertChildren.sort(
            (a, b) => (ProblemUtils.severityCompare(a.node.severity, b.node.severity) || compareURI(a.node.uri, b.node.uri))
        );

        let startIndex = 0;
        const children = parent.children as MarkerInfoNode[];
        for (const { node } of sortedInsertChildren) {
            const index = children.findIndex(value => value.id === node.id);
            if (index !== -1) {
                CompositeTreeNode.removeChild(parent, node);
            }
            if (children.length === 0) {
                children.push(node);
                startIndex = 1;
                CompositeTreeNode.setParent(node, 0, parent);
            } else {
                let inserted = false;
                for (let i = startIndex; i < children.length; i++) {
                    // sort by severity, equal severity => sort by URI
                    if (ProblemUtils.severityCompare(node.severity, children[i].severity) < 0
                        || (ProblemUtils.severityCompare(node.severity, children[i].severity) === 0 && compareURI(node.uri, children[i].uri) < 0)) {
                        children.splice(i, 0, node);
                        inserted = true;
                        startIndex = i + 1;
                        CompositeTreeNode.setParent(node, i, parent);
                        break;
                    };
                }
                if (inserted === false) {
                    children.push(node);
                    startIndex = children.length;
                    CompositeTreeNode.setParent(node, children.length - 1, parent);
                }
            }
        }
    }

    const compareURI = (uri1: URI, uri2: URI): number =>
        uri1.toString().localeCompare(uri2.toString(), undefined, { sensitivity: 'base' });
    ;
}
