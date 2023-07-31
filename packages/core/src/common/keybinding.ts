// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { isObject } from './types';

/**
 * A Keybinding binds a specific key sequence ({@link Keybinding#keybinding}) to trigger a command ({@link Keybinding#command}). A Keybinding optionally may
 * define a "when clause" ({@link Keybinding#when}) to specify in which context it becomes active.
 * @see KeyBindingRegistry
 */
export interface Keybinding {
    /**
     * Unique command identifier of the command to be triggered by this keybinding.
     */
    command: string;
    /**
     * The key sequence for the keybinding as defined in packages/keymaps/README.md.
     */
    keybinding: string;
    /**
     * The optional keybinding context where this binding belongs to.
     * If not specified, then this keybinding context belongs to the NOOP
     * keybinding context.
     *
     * @deprecated use `when` closure instead
     */
    context?: string;
    /**
     * An optional clause defining the condition when the keybinding is active, e.g. based on the current focus.
     * See {@link https://code.visualstudio.com/docs/getstarted/keybindings#_when-clause-contexts} for more details.
     */
    when?: string;

    /**
     * Optional arguments that will be passed to the command when it gets triggered via this keybinding.
     * Needs to be specified when the triggered command expects arguments to be passed to the command handler.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args?: any;
}
export namespace Keybinding {

    /**
     * Compares two keybindings for equality.
     * Can optionally ignore the keybinding and/or args property in the comparison.
     * @param a The first Keybinding in the comparison
     * @param b The second Keybinding in the comparison
     * @param ignoreKeybinding Ignore the 'keybinding' property in the comparison
     * @param ignoreArgs Ignore the 'args' property in the comparison
     */
    export function equals(a: Keybinding, b: Keybinding, ignoreKeybinding: boolean = false, ignoreArgs: boolean = false): boolean {
        if (a.command === b.command &&
            (a.context || '') === (b.context || '') &&
            (a.when || '') === (b.when || '') &&
            (ignoreKeybinding || a.keybinding === b.keybinding) &&
            (ignoreArgs || (a.args || '') === (b.args || ''))) {
            return true;
        }
        return false;
    }

    /**
     * Returns a new object only containing properties which
     * are described on the `Keybinding` API.
     *
     * @param binding the binding to create an API object for.
     */
    export function apiObjectify(binding: Keybinding | RawKeybinding): Keybinding {
        return {
            command: binding.command,
            keybinding: retrieveKeybinding(binding),
            context: binding.context,
            when: binding.when,
            args: binding.args
        };
    }

    export function retrieveKeybinding(binding: Partial<Keybinding & RawKeybinding>): string {
        return binding.keybinding ?? binding.key ?? '';
    }

    /**
     * Returns with the string representation of the binding.
     * Any additional properties which are not described on
     * the `Keybinding` API will be ignored.
     *
     * @param binding the binding to stringify.
     */
    export function stringify(binding: Keybinding): string {
        return JSON.stringify(apiObjectify(binding));
    }

    /* Determine whether object is a KeyBinding */
    export function is(arg: unknown): arg is Keybinding {
        return isObject(arg) && 'command' in arg && 'keybinding' in arg;
    }

    export function replaceKeybinding(keybindings: Keybinding[], oldKeybinding: Keybinding, newKeybinding: Keybinding): boolean {
        const indexOld = keybindings.findIndex(keybinding => Keybinding.equals(keybinding, oldKeybinding, false, true));
        if (indexOld >= 0) {
            const indexNew = keybindings.findIndex(keybinding => Keybinding.equals(keybinding, newKeybinding, false, true));
            if (indexNew >= 0 && indexNew !== indexOld) {
                // if keybindings already contain the new keybinding, remove the old keybinding and update the new one
                keybindings.splice(indexOld, 1);
                keybindings[indexNew] = newKeybinding;
            } else {
                keybindings[indexOld] = newKeybinding;
            }
            return true;
        }
        return false;
    }

    export function addKeybinding(keybindings: Keybinding[], newKeybinding: Keybinding): void {
        const index = keybindings.findIndex(keybinding => Keybinding.equals(keybinding, newKeybinding, false, true));
        if (index >= 0) {
            // if keybindings already contain the new keybinding, update it
            keybindings[index] = newKeybinding;
        } else {
            keybindings.push(newKeybinding);
        }
    }
}

/**
 * @internal
 *
 * Optional representation of key sequence as found in `keymaps.json` file.
 * Use `keybinding` as the official representation.
 */
export interface RawKeybinding extends Omit<Keybinding, 'keybinding'> {
    key: string;
}

export namespace RawKeybinding {
    export function is(candidate: unknown): candidate is RawKeybinding {
        return isObject(candidate) && 'command' in candidate && 'key' in candidate;
    }
}
