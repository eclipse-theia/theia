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

interface DynamicPickItem { label: string, configurationType: string, request: string, providerType: string, workspaceFolderUri?: string }

export interface DebugConfigurationSelectProps {
    manager: DebugConfigurationManager,
    quickInputService: QuickInputService,
    isMultiRoot: boolean
}

export interface DebugProviderSelectState {
    providerTypes: string[],
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
            providerTypes: [],
            currentValue: undefined
        };
        this.manager.onDidChangeConfigurationProviders(() => {
            this.refreshDebugConfigurations();
        });
    }

    override componentDidUpdate(): void {
        // synchronize the currentValue with the selectComponent value
        if (this.selectRef.current?.value !== this.currentValue) {
            this.refreshDebugConfigurations();
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
            onFocus={() => this.refreshDebugConfigurations()}
            onBlur={() => this.refreshDebugConfigurations()}
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
            const providerType = this.parsePickValue(value);
            this.selectDynamicConfigFromQuickPick(providerType);
        } else {
            const data = JSON.parse(value) as DebugSessionOptions;
            this.manager.current = data;
            this.refreshDebugConfigurations();
        }
    };

    protected toPickValue(providerType: string): string {
        return DebugConfigurationSelect.PICK + providerType;
    }

    protected parsePickValue(value: string): string {
        return value.slice(DebugConfigurationSelect.PICK.length);
    }

    protected async resolveDynamicConfigurationPicks(providerType: string): Promise<DynamicPickItem[]> {
        const configurationsOfProviderType =
            (await this.manager.provideDynamicDebugConfigurations())[providerType];

        if (!configurationsOfProviderType) {
            return [];
        }

        return configurationsOfProviderType.map(options => ({
            label: options.configuration.name,
            configurationType: options.configuration.type,
            request: options.configuration.request,
            providerType: options.providerType,
            description: this.toBaseName(options.workspaceFolderUri),
            workspaceFolderUri: options.workspaceFolderUri
        }));
    }

    protected async selectDynamicConfigFromQuickPick(providerType: string): Promise<void> {
        const picks: DynamicPickItem[] = await this.resolveDynamicConfigurationPicks(providerType);

        if (picks.length === 0) {
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
        this.refreshDebugConfigurations();
    }

    protected refreshDebugConfigurations = async () => {
        const configsOptionsPerType = await this.manager.provideDynamicDebugConfigurations();
        const providerTypes = [];
        for (const [type, configurationsOptions] of Object.entries(configsOptionsPerType)) {
            if (configurationsOptions.length > 0) {
                providerTypes.push(type);
            }
        }

        const value = this.currentValue;
        this.selectRef.current!.value = value;
        this.setState({ providerTypes, currentValue: value });
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

        // Add dynamic configuration types for quick pick selection
        const types = this.state.providerTypes;
        if (types.length > 0) {
            options.push({
                separator: true
            });
            for (const type of types) {
                const value = this.toPickValue(type);
                options.push({
                    value,
                    label: type + '...'
                });
            }
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
        const name = options.configuration?.name ?? options.name;
        if (!options.workspaceFolderUri || !multiRoot) {
            return name;
        }
        return `${name} (${this.toBaseName(options.workspaceFolderUri)})`;
    }

    protected toBaseName(uri: string | undefined): string {
        return uri ? new URI(uri).path.base : '';
    }
}
