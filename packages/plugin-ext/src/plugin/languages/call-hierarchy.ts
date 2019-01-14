/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import URI from 'vscode-uri/lib/umd';
import * as theia from '@theia/plugin';
import * as types from '../types-impl';
import { DocumentsExtImpl } from '../documents';
import * as model from '../../api/model';
import { createToken } from '../token-provider';

export class CallHierarchyAdapter {

    constructor(
        private readonly provider: theia.CallHierarchyProvider,
        private readonly documents: DocumentsExtImpl
    ) { }

    provideRootDefinition(resource: URI, location: model.Location): Promise<model.CallHierarchyDefinition | undefined> {
        const documentData = this.documents.getDocumentData(resource);
        if (!documentData) {
            return Promise.reject(new Error(`There is no document for ${resource}`));
        }

        return Promise.resolve(this.provider.provideRootDefinition(documentData.document,
            {
                uri: URI.revive(location.uri),
                range: new types.Range(location.range.startLineNumber - 1, location.range.startColumn - 1,
                            location.range.endLineNumber - 1, location.range.endColumn - 1)
            },
            createToken())).then(definition => {
            if (!definition) {
                return undefined;
            }

            return this.fromCallHierarchyDefinition(definition);
        });
    }

    provideCallers(definition: model.CallHierarchyDefinition): Promise<model.CallHierarchyCaller[] | undefined> {
        if (typeof this.provider.provideCallers !== 'function') {
            return Promise.resolve(undefined);
        }

        return Promise.resolve(this.provider.provideCallers(this.toCallHierarchyDefinition(definition), createToken())).then(caller => {
            if (!caller) {
                return undefined;
            }

            if (this.isCallerArray(caller)) {
                const callers: model.CallHierarchyCaller[] = [];

                for (const callerItem of caller) {
                    callers.push(this.fromCallHierarchyCaller(callerItem));
                }

                return callers;
            }
        });
    }

    /* tslint:disable-next-line:no-any */
    private isCallerArray(array: any): array is types.CallHierarchyCaller[] {
        return Array.isArray(array) && array.length > 0 && array[0] instanceof types.CallHierarchyCaller;
    }

    private fromCallHierarchyDefinition(definition: theia.CallHierarchyDefinition): model.CallHierarchyDefinition {
        return {
            location: {
                uri: definition.location.uri,
                range: {
                    startLineNumber: definition.location.range.start.line + 1,
                    startColumn: definition.location.range.start.character + 1,
                    endLineNumber: definition.location.range.end.line + 1,
                    endColumn: definition.location.range.end.character + 1
                }
            },
            symbolName: definition.symbolName,
            symbolKind: definition.symbolKind,
            containerName: definition.containerName,
            callers: (definition.callers) ? definition.callers.map(this.fromCallHierarchyCaller) : undefined
        };
    }

    private toCallHierarchyDefinition(definition: model.CallHierarchyDefinition): theia.CallHierarchyDefinition {
        return {
            location:  {
                uri: URI.revive(definition.location),
                range: new types.Range(definition.location.range.startLineNumber - 1, definition.location.range.startColumn - 1,
                            definition.location.range.endLineNumber - 1, definition.location.range.endColumn - 1)
            },
            symbolName: definition.symbolName,
            symbolKind: definition.symbolKind,
            containerName: definition.containerName,
            callers: (definition.callers) ? definition.callers.map(this.toCallHierarchyCaller) : undefined
        };
    }

    private fromCallHierarchyCaller(caller: theia.CallHierarchyCaller): model.CallHierarchyCaller {
        return {
            callerDefinition: this.fromCallHierarchyDefinition(caller.callerDefinition),
            references: caller.references.map(l => <model.Location>{
                uri: l.uri,
                range: {
                    startLineNumber: l.range.start.line + 1,
                    startColumn: l.range.start.character + 1,
                    endLineNumber: l.range.end.line + 1,
                    endColumn: l.range.end.character + 1
                }
            })
        };
    }

    private toCallHierarchyCaller(caller: model.CallHierarchyCaller): theia.CallHierarchyCaller {
        return {
            callerDefinition: this.toCallHierarchyDefinition(caller.callerDefinition),
            references: caller.references.map(l => <types.Location>{
                uri: URI.revive(l.uri),
                range: new types.Range(l.range.startLineNumber - 1, l.range.startColumn - 1,
                        l.range.endLineNumber - 1, l.range.endColumn - 1)
            })
        };
    }
}
