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
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// Based on https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/contrib/testing/common/testProfileService.ts

/* eslint-disable import/no-extraneous-dependencies */

import { Emitter, Event } from '@theia/monaco-editor-core/esm/vs/base/common/event';
import { isDefined } from '@theia/monaco-editor-core/esm/vs/base/common/types';
import { IContextKey, IContextKeyService } from '@theia/monaco-editor-core/esm/vs/platform/contextkey/common/contextkey';
import { createDecorator } from '@theia/monaco-editor-core/esm/vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope, StorageTarget } from '@theia/monaco-editor-core/esm/vs/platform/storage/common/storage';
import { StoredValue } from './stored-value';
import { InternalTestItem, ITestRunProfile, TestRunProfileBitset, testRunProfileBitsetList } from './test-types';
import { TestId } from './test-id';
import { TestingContextKeys } from './testing-context-keys';

import { IMainThreadTestController } from './test-service';

export const ITestProfileService = createDecorator<ITestProfileService>('testProfileService');

export interface ITestProfileService {
    readonly _serviceBrand: undefined;

    /**
     * Fired when any profile changes.
     */
    readonly onDidChange: Event<void>;

    /**
     * Publishes a new test profile.
     */
    addProfile(controller: IMainThreadTestController, profile: ITestRunProfile): void;

    /**
     * Updates an existing test run profile
     */
    updateProfile(controllerId: string, profileId: number, update: Partial<ITestRunProfile>): void;

    /**
     * Removes a profile. If profileId is not given, all profiles
     * for the given controller will be removed.
     */
    removeProfile(controllerId: string, profileId?: number): void;

    /**
     * Gets capabilities for the given test, indicating whether
     * there's any usable profiles available for those groups.
     * @returns a bitset to use with {@link TestRunProfileBitset}
     */
    capabilitiesForTest(test: InternalTestItem): number;

    /**
     * Configures a test profile.
     */
    configure(controllerId: string, profileId: number): void;

    /**
     * Gets all registered controllers, grouping by controller.
     */
    all(): Iterable<Readonly<{
        controller: IMainThreadTestController;
        profiles: ITestRunProfile[];
    }>>;

    /**
     * Gets the default profiles to be run for a given run group.
     */
    getGroupDefaultProfiles(group: TestRunProfileBitset): ITestRunProfile[];

    /**
     * Sets the default profiles to be run for a given run group.
     */
    setGroupDefaultProfiles(group: TestRunProfileBitset, profiles: ITestRunProfile[]): void;

    /**
     * Gets the profiles for a controller, in priority order.
     */
    getControllerProfiles(controllerId: string): ITestRunProfile[];
}

/**
 * Gets whether the given profile can be used to run the test.
 */
export const canUseProfileWithTest = (profile: ITestRunProfile, test: InternalTestItem) =>
    profile.controllerId === test.controllerId && (TestId.isRoot(test.item.extId) || !profile.tag || test.item.tags.includes(profile.tag));

const sorter = (a: ITestRunProfile, b: ITestRunProfile) => {
    if (a.isDefault !== b.isDefault) {
        return a.isDefault ? -1 : 1;
    }

    return a.label.localeCompare(b.label);
};

/**
 * Given a capabilities bitset, returns a map of context keys representing
 * them.
 */
export const capabilityContextKeys = (capabilities: number): [key: string, value: boolean][] => [
    [TestingContextKeys.hasRunnableTests.key, (capabilities & TestRunProfileBitset.Run) !== 0],
    [TestingContextKeys.hasDebuggableTests.key, (capabilities & TestRunProfileBitset.Debug) !== 0],
    [TestingContextKeys.hasCoverableTests.key, (capabilities & TestRunProfileBitset.Coverage) !== 0],
];

interface ControllerProfiles {
    profiles: ITestRunProfile[];
    controller: IMainThreadTestController;
}

export class TestProfileService implements ITestProfileService {
    declare readonly _serviceBrand: undefined;
    private readonly preferredDefaults: StoredValue<{ [K in TestRunProfileBitset]?: { controllerId: string; profileId: number }[] }>;
    private readonly capabilitiesContexts: { [K in TestRunProfileBitset]: IContextKey<boolean> };
    private readonly changeEmitter = new Emitter<void>();
    private readonly controllerProfiles = new Map</* controller ID */string, {
        profiles: ITestRunProfile[];
        controller: IMainThreadTestController;
    }>();

    /** @inheritdoc */
    public readonly onDidChange = this.changeEmitter.event;

    constructor(
        @IContextKeyService contextKeyService: IContextKeyService,
        @IStorageService storageService: IStorageService,
    ) {
        this.preferredDefaults = new StoredValue({
            key: 'testingPreferredProfiles',
            scope: StorageScope.WORKSPACE,
            target: StorageTarget.USER,
        }, storageService);

        this.capabilitiesContexts = {
            [TestRunProfileBitset.Run]: TestingContextKeys.hasRunnableTests.bindTo(contextKeyService),
            [TestRunProfileBitset.Debug]: TestingContextKeys.hasDebuggableTests.bindTo(contextKeyService),
            [TestRunProfileBitset.Coverage]: TestingContextKeys.hasCoverableTests.bindTo(contextKeyService),
            [TestRunProfileBitset.HasNonDefaultProfile]: TestingContextKeys.hasNonDefaultProfile.bindTo(contextKeyService),
            [TestRunProfileBitset.HasConfigurable]: TestingContextKeys.hasConfigurableProfile.bindTo(contextKeyService),
        };

        this.refreshContextKeys();
    }

    /** @inheritdoc */
    public addProfile(controller: IMainThreadTestController, profile: ITestRunProfile): void {
        let record = this.controllerProfiles.get(profile.controllerId);
        if (record) {
            record.profiles.push(profile);
            record.profiles.sort(sorter);
        } else {
            record = {
                profiles: [profile],
                controller,
            };
            this.controllerProfiles.set(profile.controllerId, record);
        }

        this.refreshContextKeys();
        this.changeEmitter.fire();
    }

    /** @inheritdoc */
    public updateProfile(controllerId: string, profileId: number, update: Partial<ITestRunProfile>): void {
        const ctrl = this.controllerProfiles.get(controllerId);
        if (!ctrl) {
            return;
        }

        const profile = ctrl.profiles.find(c => c.controllerId === controllerId && c.profileId === profileId);
        if (!profile) {
            return;
        }

        Object.assign(profile, update);
        ctrl.profiles.sort(sorter);
        this.changeEmitter.fire();
    }

    /** @inheritdoc */
    public configure(controllerId: string, profileId: number): void {
        this.controllerProfiles.get(controllerId)?.controller.configureRunProfile(profileId);
    }

    /** @inheritdoc */
    public removeProfile(controllerId: string, profileId?: number): void {
        const ctrl = this.controllerProfiles.get(controllerId);
        if (!ctrl) {
            return;
        }

        if (!profileId) {
            this.controllerProfiles.delete(controllerId);
            this.changeEmitter.fire();
            return;
        }

        const index = ctrl.profiles.findIndex(c => c.profileId === profileId);
        if (index === -1) {
            return;
        }

        ctrl.profiles.splice(index, 1);
        this.refreshContextKeys();
        this.changeEmitter.fire();
    }

    /** @inheritdoc */
    public capabilitiesForTest(test: InternalTestItem): number {
        const ctrl = this.controllerProfiles.get(test.controllerId);
        if (!ctrl) {
            return 0;
        }

        let capabilities = 0;
        for (const profile of ctrl.profiles) {
            if (!profile.tag || test.item.tags.includes(profile.tag)) {
                capabilities |= capabilities & profile.group ? TestRunProfileBitset.HasNonDefaultProfile : profile.group;
            }
        }

        return capabilities;
    }

    /** @inheritdoc */
    public all(): IterableIterator<ControllerProfiles> {
        return this.controllerProfiles.values();
    }

    /** @inheritdoc */
    public getControllerProfiles(profileId: string): ITestRunProfile[] {
        return this.controllerProfiles.get(profileId)?.profiles ?? [];
    }

    /** @inheritdoc */
    public getGroupDefaultProfiles(group: TestRunProfileBitset): ITestRunProfile[] {
        const preferred = this.preferredDefaults.get();
        if (!preferred) {
            return this.getBaseDefaults(group);
        }

        const profiles = preferred[group]
            ?.map(p => this.controllerProfiles.get(p.controllerId)?.profiles.find(
                c => c.profileId === p.profileId && c.group === group))
            .filter(isDefined);

        return profiles?.length ? profiles : this.getBaseDefaults(group);
    }

    /** @inheritdoc */
    public setGroupDefaultProfiles(group: TestRunProfileBitset, profiles: ITestRunProfile[]): void {
        this.preferredDefaults.store({
            ...this.preferredDefaults.get(),
            [group]: profiles.map(c => ({ profileId: c.profileId, controllerId: c.controllerId })),
        });

        this.changeEmitter.fire();
    }

    private getBaseDefaults(group: TestRunProfileBitset): ITestRunProfile[] {
        const defaults: ITestRunProfile[] = [];
        for (const { profiles } of this.controllerProfiles.values()) {
            const profile = profiles.find(c => c.group === group);
            if (profile) {
                defaults.push(profile);
            }
        }

        return defaults;
    }

    private refreshContextKeys(): void {
        let allCapabilities = 0;
        for (const { profiles } of this.controllerProfiles.values()) {
            for (const profile of profiles) {
                allCapabilities |= allCapabilities & profile.group ? TestRunProfileBitset.HasNonDefaultProfile : profile.group;
            }
        }

        for (const group of testRunProfileBitsetList) {
            this.capabilitiesContexts[group].set((allCapabilities & group) !== 0);
        }
    }
}
