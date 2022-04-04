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
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import URI from '@theia/core/lib/common/uri';
import * as React from '@theia/core/shared/react';
import { DebugConfigurationManager } from '../debug-configuration-manager';
import { DebugSessionOptions, InternalDebugSessionOptions } from '../debug-session-options';
import { QuickInputService } from '@theia/core/lib/browser';
import { nls } from '@theia/core/lib/common/nls';

interface DynamicPickItem { label: string, configurationType: string, request: string, providerType: string }

export interface DebugConfigurationSelectProps {
    manager: DebugConfigurationManager,
    quickInputService: QuickInputService,
    isMultiRoot: boolean
}

export interface DebugProviderSelectState {
    providerTypes: string[]
}

export class DebugConfigurationSelect extends React.Component<DebugConfigurationSelectProps, DebugProviderSelectState> {
    protected static readonly SEPARATOR = '──────────';
    protected static readonly PICK = '__PICK__';
    protected static readonly NO_CONFIGURATION = '__NO_CONF__';
    protected static readonly ADD_CONFIGURATION = '__ADD_CONF__';

    private manager: DebugConfigurationManager;
    private quickInputService: QuickInputService;

    constructor(props: DebugConfigurationSelectProps) {
        super(props);
        this.manager = props.manager;
        this.quickInputService = props.quickInputService;
        this.state = {
            providerTypes: [],
        };
        this.manager.onDidChangeConfigurationProviders(() => {
            this.refreshDebugConfigurations();
        });
    }

    override componentDidMount(): void {
        this.refreshDebugConfigurations();
    }

    override render(): React.ReactNode {
        return <select
            className='theia-select debug-configuration'
            value={this.currentValue}
            onChange={this.setCurrentConfiguration}
            onFocus={this.refreshDebugConfigurations}
            onBlur={this.refreshDebugConfigurations}
        >
            {this.renderOptions()}
        </select>;
    }

    protected get currentValue(): string {
        const { current } = this.manager;
        return current ? InternalDebugSessionOptions.toValue(current) : DebugConfigurationSelect.NO_CONFIGURATION;
    }

    protected readonly setCurrentConfiguration = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.currentTarget.value;
        if (value === DebugConfigurationSelect.ADD_CONFIGURATION) {
            this.manager.addConfiguration();
        } else if (value.startsWith(DebugConfigurationSelect.PICK)) {
            const providerType = this.parsePickValue(value);
            this.selectDynamicConfigFromQuickPick(providerType);
        } else {
            const { name, type, request, workspaceFolderUri, providerType } = InternalDebugSessionOptions.parseValue(value);
            this.manager.current = this.manager.find(
                { name, type, request },
                workspaceFolderUri,
                providerType === 'undefined' ? undefined : providerType
            );
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

        return configurationsOfProviderType.map(configuration => ({
            label: configuration.name,
            configurationType: configuration.type,
            request: configuration.request,
            providerType
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
        this.manager.current = this.manager.find(selectedConfiguration, undefined, selected.providerType);
    }

    protected refreshDebugConfigurations = async () => {
        const configsPerType = await this.manager.provideDynamicDebugConfigurations();
        const providerTypes = [];
        for (const [ type, configurations ] of Object.entries(configsPerType)) {
            if (configurations.length > 0) {
                providerTypes.push(type);
            }
        }
        this.setState({ providerTypes });
    };

    protected renderOptions(): React.ReactNode {
        const options: React.ReactNode[] = [];

        // Add non dynamic debug configurations
        for (const config of this.manager.all) {
            const value = InternalDebugSessionOptions.toValue(config);
            options.push(<option key={value} value={value}>
                {this.toName(config, this.props.isMultiRoot)}
            </option>);
        }

        // Add recently used dynamic debug configurations
        const { recentDynamicOptions } = this.manager;
        if (recentDynamicOptions.length > 0) {
            if (options.length > 0) {
                options.push(<option key={'recent-configs-sep'} disabled>{DebugConfigurationSelect.SEPARATOR}</option>);
            }
            for (const dynamicOption of recentDynamicOptions) {
                const value = InternalDebugSessionOptions.toValue(dynamicOption);
                options.push(<option key={value} value={value}>
                    {this.toName(dynamicOption, this.props.isMultiRoot)} ({dynamicOption.providerType})
                </option>);
            }
        }

        // Placing a 'No Configuration' entry enables proper functioning of the 'onChange' event, by
        // having an entry to switch from (E.g. a case where only one dynamic configuration type is available)
        if (options.length === 0) {
            const value = DebugConfigurationSelect.NO_CONFIGURATION;
            options.push(
                <option
                    key={value}
                    value={value}>{nls.localizeByDefault('No Configurations')}
                </option>);
        }

        // Add dynamic configuration types for quick pick selection
        const types = this.state.providerTypes;
        if (types.length > 0) {
            options.push(<option key={'dynamic-types-sep'} disabled>{DebugConfigurationSelect.SEPARATOR}</option>);
            for (const type of types) {
                const value = this.toPickValue(type);
                options.push(<option key={value} value={value}>{type}...</option>);
            }
        }

        options.push(
            <option
                key={'add-config-sep'}
                disabled>{DebugConfigurationSelect.SEPARATOR}
            </option>,
            <option
                key={DebugConfigurationSelect.ADD_CONFIGURATION}
                value={DebugConfigurationSelect.ADD_CONFIGURATION}>{nls.localizeByDefault('Add Configuration...')}
            </option>
        );

        return options;
    };

    protected toName({ configuration, workspaceFolderUri }: DebugSessionOptions, multiRoot: boolean): string {
        if (!workspaceFolderUri || !multiRoot) {
            return configuration.name;
        }
        return `${configuration.name} (${new URI(workspaceFolderUri).path.base})`;
    }
}
