/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import URI from '@theia/core/lib/common/uri';
import * as React from '@theia/core/shared/react';
import { DebugConfigurationManager } from '../debug-configuration-manager';
import { DebugSessionOptions } from '../debug-session-options';
import { SelectComponent, SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import { QuickInputService } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';
import { DebugSessionConfigurationLabelProvider } from '../debug-session-configuration-label-provider';
import { DynamicDebugConfigurationProvider } from '../../common/debug-service';

interface DynamicPickItem { label: string, configurationType: string, request: string, providerType: string, workspaceFolderUri?: string }

export interface DebugConfigurationSelectProps {
    manager: DebugConfigurationManager,
    quickInputService: QuickInputService,
    labelProvider: DebugSessionConfigurationLabelProvider,
    isMultiRoot: boolean
}

export interface DebugProviderSelectState {
    providers: DynamicDebugConfigurationProvider[],
    currentValue: string | undefined
}

export class DebugConfigurationSelect extends React.Component<DebugConfigurationSelectProps, DebugProviderSelectState> {
    protected static readonly SEPARATOR = '──────────';
    protected static readonly PICK = '__PICK__';
    protected static readonly NO_CONFIGURATION = '__NO_CONF__';
    protected static readonly ADD_CONFIGURATION = '__ADD_CONF__';
    protected static readonly CONFIG_MARKER = '__CONFIG__';

    private readonly selectRef = React.createRef<SelectComponent>();
    private manager: DebugConfigurationManager;
    private quickInputService: QuickInputService;

    constructor(props: DebugConfigurationSelectProps) {
        super(props);
        this.manager = props.manager;
        this.quickInputService = props.quickInputService;
        this.state = {
            providers: [],
            currentValue: undefined
        };
        this.manager.onDidChangeDynamicConfigurations(() => {
            this.refreshDebugConfigurations();
        });
    }

    override componentDidUpdate(): void {
        // synchronize the currentValue with the selectComponent value
        const currentValue = this.currentValue;
        if (this.state.currentValue !== currentValue) {
            if (this.selectRef.current) {
                this.selectRef.current.value = currentValue;
            }
            this.setState({ currentValue });
        }
    }

    override componentDidMount(): void {
        this.refreshDebugConfigurations();
    }

    override render(): React.ReactNode {
        return <SelectComponent
            options={this.renderOptions()}
            defaultValue={this.state.currentValue}
            onChange={option => this.setCurrentConfiguration(option)}
            ref={this.selectRef}
        />;
    }

    protected get currentValue(): string {
        const { current } = this.manager;
        const matchingOption = this.getCurrentOption(current);
        return matchingOption ? matchingOption.value! : current ? JSON.stringify(current) : DebugConfigurationSelect.NO_CONFIGURATION;
    }

    protected getCurrentOption(current: DebugSessionOptions | undefined): SelectOption | undefined {
        if (!current || !this.selectRef.current) {
            return;
        }
        const matchingOption = this.selectRef.current!.options.find(option =>
            option.userData === DebugConfigurationSelect.CONFIG_MARKER
            && this.matchesOption(JSON.parse(option.value!), current)
        );
        return matchingOption;
    }

    protected matchesOption(sessionOption: DebugSessionOptions, current: DebugSessionOptions): boolean {
        const matchesNameAndWorkspace = sessionOption.name === current.name && sessionOption.workspaceFolderUri === current.workspaceFolderUri;
        return DebugSessionOptions.isConfiguration(sessionOption) && DebugSessionOptions.isConfiguration(current)
            ? matchesNameAndWorkspace && sessionOption.providerType === current.providerType
            : matchesNameAndWorkspace;
    }

    protected readonly setCurrentConfiguration = (option: SelectOption) => {
        const value = option.value;
        if (!value) {
            return false;
        } else if (value === DebugConfigurationSelect.ADD_CONFIGURATION) {
            setTimeout(() => this.manager.addConfiguration());
        } else if (value.startsWith(DebugConfigurationSelect.PICK)) {
            const providerIndex = parseInt(this.parsePickValue(value), 10);
            const provider = this.state.providers[providerIndex];
            if (provider) {
                this.selectDynamicConfigFromQuickPick(provider);
            }
        } else {
            const data = JSON.parse(value) as DebugSessionOptions;
            this.manager.current = data;
        }
    };

    protected toPickValue(providerType: string): string {
        return DebugConfigurationSelect.PICK + providerType;
    }

    protected parsePickValue(value: string): string {
        return value.slice(DebugConfigurationSelect.PICK.length);
    }

    /**
     * Fetches the actual debug configurations for a provider (which may have multiple types).
     * This is called lazily when the user selects a provider from the dropdown,
     * triggering extension activation and provideDebugConfigurations call only for the
     * specified types, rather than activating all extensions.
     */
    protected async resolveDynamicConfigurationPicks(provider: DynamicDebugConfigurationProvider): Promise<DynamicPickItem[]> {
        // Fetch configurations for all types under this provider's label
        const allPicks: DynamicPickItem[] = [];
        for (const providerType of provider.types) {
            const configurationsOfProviderType = await this.manager.provideDynamicDebugConfigurationsByType(providerType);

            if (configurationsOfProviderType && configurationsOfProviderType.length > 0) {
                allPicks.push(...configurationsOfProviderType.map(options => ({
                    label: options.configuration.name,
                    configurationType: options.configuration.type,
                    request: options.configuration.request,
                    providerType: options.providerType,
                    description: this.toBaseName(options.workspaceFolderUri),
                    workspaceFolderUri: options.workspaceFolderUri
                })));
            }
        }
        return allPicks;
    }

    protected async selectDynamicConfigFromQuickPick(provider: DynamicDebugConfigurationProvider): Promise<void> {
        const picks: DynamicPickItem[] = await this.resolveDynamicConfigurationPicks(provider);

        if (picks.length === 0) {
            this.quickInputService.showQuickPick(
                [{ label: nls.localizeByDefault('No Configurations') }],
                { placeholder: nls.localizeByDefault('Select Launch Configuration') }
            );
            return;
        }

        const selected: DynamicPickItem | undefined = await this.quickInputService.showQuickPick(
            picks,
            {
                placeholder: nls.localizeByDefault('Select Launch Configuration')
            }
        );

        if (!selected) {
            return;
        }

        const selectedConfiguration = {
            name: selected.label,
            type: selected.configurationType,
            request: selected.request
        };
        this.manager.current = this.manager.find(selectedConfiguration, selected.workspaceFolderUri, selected.providerType);
    }

    /**
     * Refreshes the list of dynamic configuration providers shown in the dropdown.
     * This is lightweight - it only gets the provider labels without invoking the
     * providers.
     */
    protected refreshDebugConfigurations = () => {
        const providers = this.manager.getDynamicDebugConfigurationProviders();
        const value = this.currentValue;
        if (this.selectRef.current) {
            this.selectRef.current.value = value;
        }
        this.setState({ providers, currentValue: value });
    };

    protected renderOptions(): SelectOption[] {
        const options: SelectOption[] = [];

        // Add non dynamic debug configurations
        for (const config of this.manager.all) {
            const value = JSON.stringify(config);
            options.push({
                value,
                label: this.toName(config, this.props.isMultiRoot),
                userData: DebugConfigurationSelect.CONFIG_MARKER
            });
        }

        // Add recently used dynamic debug configurations
        const { recentDynamicOptions } = this.manager;
        if (recentDynamicOptions.length > 0) {
            if (options.length > 0) {
                options.push({
                    separator: true
                });
            }
            for (const dynamicOption of recentDynamicOptions) {
                const value = JSON.stringify(dynamicOption);
                options.push({
                    value,
                    label: this.toName(dynamicOption, this.props.isMultiRoot) + ' (' + dynamicOption.providerType + ')',
                    userData: DebugConfigurationSelect.CONFIG_MARKER
                });
            }
        }

        // Placing a 'No Configuration' entry enables proper functioning of the 'onChange' event, by
        // having an entry to switch from (E.g. a case where only one dynamic configuration type is available)
        if (options.length === 0) {
            const value = DebugConfigurationSelect.NO_CONFIGURATION;
            options.push({
                value,
                label: nls.localizeByDefault('No Configurations')
            });
        }

        // Add dynamic configuration providers for quick pick selection (grouped by label)
        const providers = this.state.providers;
        if (providers.length > 0) {
            options.push({
                separator: true
            });
            providers.forEach((provider, index) => {
                const value = this.toPickValue(String(index));
                options.push({
                    value,
                    label: provider.label + '...'
                });
            });
        }

        options.push({
            separator: true
        });
        options.push({
            value: DebugConfigurationSelect.ADD_CONFIGURATION,
            label: nls.localizeByDefault('Add Configuration...')
        });

        return options;
    }

    protected toName(options: DebugSessionOptions, multiRoot: boolean): string {
        return this.props.labelProvider.getLabel(options, multiRoot);
    }

    protected toBaseName(uri: string | undefined): string {
        return uri ? new URI(uri).path.base : '';
    }
}
