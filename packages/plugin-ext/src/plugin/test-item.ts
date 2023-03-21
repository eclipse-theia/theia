// *****************************************************************************
// Copyright (C) 2023 Mathieu Bussieres and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// some code copied and modified from https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/api/common/extHostTestItem.ts

/* tslint:disable:typedef */

import type * as theia from '@theia/plugin';
import { Range as editorRange } from '@theia/testing/lib/common/range';
import { createPrivateApiFor, getPrivateApiFor, IExtHostTestItemApi } from './testing-private-api';
import { TestId, TestIdPathParts } from '@theia/testing/lib/common/test-id';
import { denamespaceTestTag, ITestItem, ITestItemContext } from '@theia/testing/lib/common/test-types';
import * as Convert from './type-converters';
import { URI as Uri } from '@theia/core/shared/vscode-uri';
import {
    createTestItemChildren,
    ExtHostTestItemEvent,
    ITestChildrenLike,
    ITestItemApi,
    ITestItemChildren,
    TestItemCollection,
    TestItemEventOp,
} from '@theia/testing/lib/common/test-item-collection';
import { EditorsAndDocumentsExtImpl } from './editors-and-documents';

const testItemPropAccessor = <K extends keyof theia.TestItem>(
    api: IExtHostTestItemApi,
    defaultValue: theia.TestItem[K],
    equals: (a: theia.TestItem[K], b: theia.TestItem[K]) => boolean,
    toUpdate: (newValue: theia.TestItem[K], oldValue: theia.TestItem[K]) => ExtHostTestItemEvent,
) => {
    let value = defaultValue;
    return {
        enumerable: true,
        configurable: false,
        get() {
            return value;
        },
        set(newValue: theia.TestItem[K]) {
            if (!equals(value, newValue)) {
                const oldValue = value;
                value = newValue;
                api.listener?.(toUpdate(newValue, oldValue));
            }
        },
    };
};

type WritableProps = Pick<theia.TestItem, 'range' | 'label' | 'description' | 'sortText' | 'canResolveChildren' | 'busy' | 'error' | 'tags'>;

const strictEqualComparator = <T>(a: T, b: T) => a === b;

const propComparators: { [K in keyof Required<WritableProps>]: (a: theia.TestItem[K], b: theia.TestItem[K]) => boolean } = {
    range: (a, b) => {
        if (a === b) { return true; }
        if (!a || !b) { return false; }
        return a.isEqual(b);
    },
    label: strictEqualComparator,
    description: strictEqualComparator,
    sortText: strictEqualComparator,
    busy: strictEqualComparator,
    error: strictEqualComparator,
    canResolveChildren: strictEqualComparator,
    tags: (a, b) => {
        if (a.length !== b.length) {
            return false;
        }

        if (a.some(t1 => !b.find(t2 => t1.id === t2.id))) {
            return false;
        }

        return true;
    },
};

const evSetProps = <T>(fn: (newValue: T) => Partial<ITestItem>): (newValue: T) => ExtHostTestItemEvent =>
    v => ({ op: TestItemEventOp.SetProp, update: fn(v) });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lift(rangeLiftReturn: any): any {
    if (rangeLiftReturn === null) {
        return undefined;
    } else {
        return rangeLiftReturn;
    }
}

const makePropDescriptors = (api: IExtHostTestItemApi, label: string): { [K in keyof Required<WritableProps>]: PropertyDescriptor } => ({
    range: (() => {
        let value: theia.Range | undefined;
        const updateProps = evSetProps<theia.Range | undefined>(r => ({ range: lift(editorRange.lift(Convert.Range.from(r))) }));
        return {
            enumerable: true,
            configurable: false,
            get() {
                return value;
            },
            set(newValue: theia.Range | undefined) {
                api.listener?.({ op: TestItemEventOp.DocumentSynced });
                if (!propComparators.range(value, newValue)) {
                    value = newValue;
                    api.listener?.(updateProps(newValue));
                }
            },
        };
    })(),
    // eslint-disable-next-line @typescript-eslint/no-shadow
    label: testItemPropAccessor<'label'>(api, label, propComparators.label, evSetProps(label => ({ label }))),
    description: testItemPropAccessor<'description'>(api, undefined, propComparators.description, evSetProps(description => ({ description }))),
    sortText: testItemPropAccessor<'sortText'>(api, undefined, propComparators.sortText, evSetProps(sortText => ({ sortText }))),
    canResolveChildren: testItemPropAccessor<'canResolveChildren'>(api, false, propComparators.canResolveChildren, state => ({
        op: TestItemEventOp.UpdateCanResolveChildren,
        state,
    })),
    busy: testItemPropAccessor<'busy'>(api, false, propComparators.busy, evSetProps(busy => ({ busy }))),
    error: testItemPropAccessor<'error'>(api, undefined, propComparators.error, evSetProps(error => ({ error: Convert.MarkdownString.fromStrict(error) || undefined }))),
    tags: testItemPropAccessor<'tags'>(api, [], propComparators.tags, (current, previous) => ({
        op: TestItemEventOp.SetTags,
        new: current.map(Convert.TestTag.from),
        old: previous.map(Convert.TestTag.from),
    })),
});

const toItemFromPlain = (item: ITestItem.Serialized): TestItemImpl => {
    const testId = TestId.fromString(item.extId);
    const testItem = new TestItemImpl(testId.controllerId, testId.localId, item.label, Uri.revive(item.uri) || undefined);
    testItem.range = Convert.Range.to(item.range || undefined);
    testItem.description = item.description || undefined;
    testItem.sortText = item.sortText || undefined;
    testItem.tags = item.tags.map(t => Convert.TestTag.to({ id: denamespaceTestTag(t).tagId }));
    return testItem;
};

export const toItemFromContext = (context: ITestItemContext): TestItemImpl => {
    let node: TestItemImpl | undefined;
    for (const test of context.tests) {
        const next = toItemFromPlain(test.item);
        getPrivateApiFor(next).parent = node;
        node = next;
    }

    return node!;
};

export class TestItemImpl implements theia.TestItem {
    public readonly id!: string;
    public readonly uri!: theia.Uri | undefined;
    public readonly children!: ITestItemChildren<theia.TestItem>;
    public readonly parent!: TestItemImpl | undefined;

    public range!: theia.Range | undefined;
    public description!: string | undefined;
    public sortText!: string | undefined;
    public label!: string;
    public error!: string | theia.MarkdownString;
    public busy!: boolean;
    public canResolveChildren!: boolean;
    public tags!: readonly theia.TestTag[];

    /**
     * Note that data is deprecated and here for back-compat only
     */
    constructor(controllerId: string, id: string, label: string, uri: theia.Uri | undefined) {
        if (id.includes(TestIdPathParts.Delimiter)) {
            throw new Error(`Test IDs may not include the ${JSON.stringify(id)} symbol`);
        }

        const api = createPrivateApiFor(this, controllerId);
        Object.defineProperties(this, {
            id: {
                value: id,
                enumerable: true,
                writable: false,
            },
            uri: {
                value: uri,
                enumerable: true,
                writable: false,
            },
            parent: {
                enumerable: false,
                get() {
                    return api.parent instanceof TestItemRootImpl ? undefined : api.parent;
                },
            },
            children: {
                value: createTestItemChildren(api, getPrivateApiFor, TestItemImpl),
                enumerable: true,
                writable: false,
            },
            ...makePropDescriptors(api, label),
        });
    }
}

export class TestItemRootImpl extends TestItemImpl {
    constructor(controllerId: string, label: string) {
        super(controllerId, controllerId, label, undefined);
    }
}

export class ExtHostTestItemCollection extends TestItemCollection<TestItemImpl> {
    constructor(controllerId: string, controllerLabel: string, editors: EditorsAndDocumentsExtImpl) {
        super({
            controllerId,
            getDocumentVersion: uri => uri && editors.getDocument(uri.toString())?.document?.version,
            getApiFor: getPrivateApiFor as (impl: TestItemImpl) => ITestItemApi<TestItemImpl>,
            getChildren: item => item.children as ITestChildrenLike<TestItemImpl>,
            root: new TestItemRootImpl(controllerId, controllerLabel),
            toITestItem: Convert.TestItem.from,
        });
    }
}
