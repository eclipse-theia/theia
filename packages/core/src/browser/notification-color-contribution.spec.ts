// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { expect } from 'chai';
import { Disposable } from '../common/disposable.js';
import { ColorDefinition } from '../common/color.js';
import { ColorRegistry } from './color-registry.js';
import { NotificationColorContribution } from './notification-color-contribution.js';

class RecordingColorRegistry extends ColorRegistry {

    readonly definitions = new Map<string, ColorDefinition>();

    protected override doRegister(definition: ColorDefinition): Disposable {
        this.definitions.set(definition.id, definition);
        return Disposable.NULL;
    }
}

describe('NotificationColorContribution', () => {

    let registry: RecordingColorRegistry;

    beforeEach(() => {
        registry = new RecordingColorRegistry();
        new NotificationColorContribution().registerColors(registry);
    });

    it('registers the notification colors', () => {
        expect([...registry.definitions.keys()]).to.have.members([
            'notificationCenter.border',
            'notificationToast.border',
            'notifications.foreground',
            'notifications.background',
            'notificationLink.foreground',
            'notificationCenterHeader.foreground',
            'notificationCenterHeader.background',
            'notifications.border',
            'notificationsErrorIcon.foreground',
            'notificationsWarningIcon.foreground',
            'notificationsInfoIcon.foreground'
        ]);
    });

    it('derives the notification icon colors from the editor problem colors', () => {
        expect(registry.definitions.get('notificationsWarningIcon.foreground')?.defaults).to.deep.equal({
            dark: 'editorWarning.foreground',
            light: 'editorWarning.foreground',
            hcDark: 'editorWarning.foreground',
            hcLight: 'editorWarning.foreground'
        });
    });

    it('derives the notifications border from the notification center header background', () => {
        expect(registry.definitions.get('notifications.border')?.defaults).to.deep.equal({
            dark: 'notificationCenterHeader.background',
            light: 'notificationCenterHeader.background',
            hcDark: 'notificationCenterHeader.background',
            hcLight: 'notificationCenterHeader.background'
        });
    });
});
