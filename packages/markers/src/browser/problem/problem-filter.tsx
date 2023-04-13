// *****************************************************************************
// Copyright (C) 2023 Hundsun and others.
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

import * as React from '@theia/core/shared/react';
import { nls } from '@theia/core/lib/common/nls';
import { codicon } from '@theia/core/lib/browser';
import { DropdownComponent } from '@theia/core/lib/browser/widgets/dropdown-component';
import URI from '@theia/core/lib/common/uri';
import { Event } from '@theia/core/lib/common';
import { ProblemFilterInput } from './components/problem-filter-input';

export interface ProblemFilterProps {
    onChange: (filters: Filters) => void;
    getProblemStat: (enableToolbarFilters: boolean) => number;
    onDidChangeMarkersEvent: Event<URI>
}

type FilterKeys = 'showErrors' | 'showWarnings' | 'showInfos' | 'showHints' | 'activeFile' | 'useFilesExclude';
export type Filters = {
    [key in FilterKeys]: boolean;
} & { text: string; };

export const ProblemFilter: React.FC<ProblemFilterProps> = (props: ProblemFilterProps) => {
    const defaultValue = {
        text: '',
        showErrors: true,
        showWarnings: true,
        showInfos: true,
        showHints: true,
        activeFile: false,
        useFilesExclude: false
    };

    const [filters, setFilters] = React.useState<Filters>({ ...defaultValue });
    const [controlVaild, setControlVaild] = React.useState<boolean>(false);
    const [markerStat, setMarkerStat] = React.useState({
        total: 0,
        filtered: 0
    });

    const changeHandler = (e: React.ChangeEvent<HTMLInputElement>, value: string) => {
        const newFilter = {
            ...filters,
            text: value?.trim() ?? ''
        };
        setFilters(newFilter);
    };

    const clickHandler = (key: FilterKeys) => {
        const newFilter = {
            ...filters,
            [key]: !filters[key]
        };

        setFilters(newFilter);
    };

    const isControlDefaultValue = () => Object.keys(defaultValue).filter(key => key !== 'text').every((key: FilterKeys) => filters[key] === defaultValue[key]);

    const udpateProblemStat = () => {
        const { getProblemStat } = props;
        let total = 0;
        let filtered = 0;
        if (!isControlDefaultValue() || filters.text) {
            total = getProblemStat(false);
            filtered = getProblemStat(true);
        }
        setMarkerStat({
            total,
            filtered
        });
    };

    React.useEffect(() => {
        props.onChange?.(filters);
        setControlVaild(!isControlDefaultValue());
        udpateProblemStat();
    }, [filters]);

    React.useEffect(() => {
        const { onDidChangeMarkersEvent } = props;
        const listener = onDidChangeMarkersEvent(() => {
            udpateProblemStat();
        });
        return () => listener.dispose();
    }, [filters]);

    const creatLabel = (label: string, isToggled = true) => <>
        <span className={`theia-dropdown-component-dropdown-item-icon ${isToggled ? 'toggled' : ''}`}></span>
        <span>{label}</span>
    </>;

    const options = React.useMemo(() => {
        const opts = [
            { key: 'showErrors', label: 'Show Errors', group: '0' },
            { key: 'showWarnings', label: 'Show Warnings', group: '0' },
            { key: 'showInfos', label: 'Show Infos', group: '0' },
            { key: 'showHints', label: 'Show Hints', group: '0' },
            { key: 'activeFile', label: 'Show Active File Only', group: '1' },
            { key: 'useFilesExclude', label: 'Hide Excluded Files', group: '1' }
        ];

        return opts.map(({ key, label, group }) => ({
            value: key,
            label: creatLabel(key === 'showHints' ? nls.localize('theia/markers/showHints', label) : nls.localizeByDefault(label), filters[key as FilterKeys]),
            group,
            onClick: () => clickHandler(key as FilterKeys)
        }));
    }, [filters]);

    return (
        <div className="theia-marker-filter-container">
            <ProblemFilterInput onChange={changeHandler}></ProblemFilterInput>
            <div className={`filter-stat-tag ${markerStat.total > markerStat.filtered ? '' : 'hidden'}`}>
                <div className='filter-stat-tag-content'>
                    {nls.localizeByDefault('Showing {0} of {1}', markerStat.filtered, markerStat.total)}
                </div>
            </div>
            <div className={`filter-control ${controlVaild ? 'valid' : ''}`} title={nls.localizeByDefault('More Filters...')} >
                <DropdownComponent options={options} key="dropdown">
                    <span className={codicon('filter')} key="filter-icon"></span>
                </DropdownComponent>
            </div>
        </div>
    );
};
