// *****************************************************************************
// Copyright (C) 2026 Typefox and others.
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

import * as Docker from 'dockerode';

const mountTypes = ['bind', 'volume', 'tmpfs', 'image'];

export function parseWorkspaceMount(mountString: string): Docker.MountSettings {
    const mountSetting: Partial<Docker.MountSettings> = {};

    const entries = mountString.split(',');

    for (const entry of entries) {
        const [key, value] = entry.split('=');

        if (key === 'type') {
            if (!mountTypes.includes(value)) {
                throw new Error(`Error parsing mount config. Invalid mount type ${value}`);
            }
            mountSetting.Type = value as Docker.MountType;
        } else if (key === 'source' || key === 'src') {
            mountSetting.Source = value;
        } else if (key === 'target' || key === 'dst' || key === 'destination') {
            mountSetting.Target = value;
        } else if (key === 'readonly' || key === 'ro') {
            mountSetting.ReadOnly = true;
        } else if (key === 'bind-propagation') {
            mountSetting.BindOptions = {
                Propagation: value as Docker.MountPropagation
            };
        }
    }

    // default target is always mount
    mountSetting.Target = mountSetting.Target ?? 'bind' as Docker.MountType;

    if (!mountSetting.Source || !mountSetting.Target) {
        throw new Error(`Invalid mount config. Missing Source or Target in: \n ${JSON.stringify(mountSetting)}`);
    }

    return mountSetting as Docker.MountSettings;
}
