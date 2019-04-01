/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, postConstruct } from 'inversify';
import { isOSX, isWindows } from '../../common/os';
import { Emitter } from '../../common/event';
import { NativeKeyboardLayout, KeyboardLayoutProvider, KeyboardLayoutChangeNotifier } from '../../common/keyboard/layout-provider';

@injectable()
export class BrowserKeyboardLayoutProvider implements KeyboardLayoutProvider, KeyboardLayoutChangeNotifier {

    private linuxFrench = require('../../../src/common/keyboard/layouts/linux-fr-French.json');
    private linuxGerman = require('../../../src/common/keyboard/layouts/linux-de-German.json');
    private macUS = require('../../../src/common/keyboard/layouts/mac-en-US.json');
    private macFrench = require('../../../src/common/keyboard/layouts/mac-fr-French.json');
    private macGerman = require('../../../src/common/keyboard/layouts/mac-de-German.json');
    private winUS = require('../../../src/common/keyboard/layouts/win-en-US.json');
    private winFrench = require('../../../src/common/keyboard/layouts/win-fr-French.json');
    private winGerman = require('../../../src/common/keyboard/layouts/win-de-German.json');

    protected get allLayouts(): NativeKeyboardLayout[] {
        return [
            this.winUS, this.macUS, this.winFrench, this.macFrench, this.winGerman, this.macGerman
        ];
    }

    protected nativeLayoutChanged = new Emitter<NativeKeyboardLayout>();

    get onNativeLayoutChanged() {
        return this.nativeLayoutChanged.event;
    }

    @postConstruct()
    protected initialize() {
        const keyboard = (navigator as NavigatorExtension).keyboard;
        if (keyboard && keyboard.addEventListener) {
            keyboard.addEventListener('layoutchange', async () => {
                const newLayout = await this.getNativeLayout();
                this.nativeLayoutChanged.fire(newLayout);
            });
        }
    }

    getNativeLayout(): Promise<NativeKeyboardLayout> {
        const keyboard = (navigator as NavigatorExtension).keyboard;
        if (keyboard && keyboard.getLayoutMap) {
            return keyboard.getLayoutMap().then(layoutMap => this.getFromLayoutMap(layoutMap));
        } else if (navigator.language) {
            return Promise.resolve(this.getFromLanguage(navigator.language));
        } else {
            return Promise.resolve(isOSX ? this.macUS : this.winUS);
        }
    }

    /**
     * @param layoutMap a keyboard layout map according to https://wicg.github.io/keyboard-map/
     */
    protected getFromLayoutMap(layoutMap: KeyboardLayoutMap): NativeKeyboardLayout {
        const tester = new KeyboardTester(this.allLayouts);
        for (const [code, key] of layoutMap.entries()) {
            tester.updateScores({ code, key });
        }
        const result = tester.getTopScoringCandidates();
        if (result.length > 0) {
            return result[0];
        } else {
            return isOSX ? this.macUS : this.winUS;
        }
    }

    /**
     * @param language an IETF BCP 47 language tag
     */
    protected getFromLanguage(language: string): NativeKeyboardLayout {
        if (isOSX) {
            if (language.startsWith('de')) {
                return this.macGerman;
            } else if (language.startsWith('fr')) {
                return this.macFrench;
            } else {
                return this.macUS;
            }
        } else if (isWindows) {
            if (language.startsWith('de')) {
                return this.winGerman;
            } else if (language.startsWith('fr')) {
                return this.winFrench;
            } else {
                return this.winUS;
            }
        } else {
            if (language.startsWith('de')) {
                return this.linuxGerman;
            } else if (language.startsWith('fr')) {
                return this.linuxFrench;
            }
        }
        return {
            info: { 'model': 'pc105', 'layout': 'us', 'variant': '', 'options': '', 'rules': '' },
            mapping: {}
        };
    }

}

interface NavigatorExtension extends Navigator {
    keyboard: Keyboard;
}

interface Keyboard {
    getLayoutMap(): Promise<KeyboardLayoutMap>;
    addEventListener(type: 'layoutchange', listener: EventListenerOrEventListenerObject): void;
}

type KeyboardLayoutMap = Map<string, string>;

interface KeyboardTestInput {
    code: string;
    key: string;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
}

class KeyboardTester {

    private readonly scores: number[];

    constructor(private readonly candidates: NativeKeyboardLayout[]) {
        this.scores = this.candidates.map(() => 0);
    }

    testCandidate(candidate: NativeKeyboardLayout, input: KeyboardTestInput): number {
        let property: 'value' | 'withShift' | 'withAltGr' | 'withShiftAltGr';
        if (input.shiftKey && input.altKey) {
            property = 'withShiftAltGr';
        } else if (input.shiftKey) {
            property = 'withShift';
        } else if (input.altKey) {
            property = 'withAltGr';
        } else {
            property = 'value';
        }
        const keyMapping = candidate.mapping[input.code];
        if (keyMapping && keyMapping[property]) {
            return keyMapping[property] === input.key ? 1 : 0;
        } else {
            return 0;
        }
    }

    updateScores(input: KeyboardTestInput): void {
        for (let i = 0; i < this.candidates.length; i++) {
            this.scores[i] += this.testCandidate(this.candidates[i], input);
        }
    }

    getTopScoringCandidates() {
        let maxScore = 0;
        for (let i = 0; i < this.scores.length; i++) {
            maxScore = Math.max(maxScore, this.scores[i]);
        }
        return this.candidates.filter((c, i) => this.scores[i] === maxScore);
    }

}
