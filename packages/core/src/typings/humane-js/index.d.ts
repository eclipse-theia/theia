/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

declare module 'humane-js' {
    class HumaneOptions {
        /* 
         * Sets the delay before a message fades out (set to 0 for no timeout).
         * default: 2500
         */
        timeout?: number;
        /* 
         * Wait for mouse, keyboard, or touch action to be taken before clearing message (after timeout)
         * default: false
         */
        waitForMove?: boolean;
        /* 
         * Click or touch the notification to close
         * default: false
         */
        clickToClose?: boolean;
        /* 
         * Delay before notification disappears (useful in conjunction with waitForMove)
         * default: 0
         */
        timeoutAfterMove?: number;
        /* 
         * Specify an additional class to apply when notifying (nice when you only want to change just a little bit of the style)
         * default: ''
         */
        addnCls?: string;
    }
    class HumaneArgs extends HumaneOptions {
        /**
         * Specify an base class
         * default: 'humane'
         */
        baseCls?: string;
    }
    class Humane extends HumaneOptions {
        create(args?: Partial<HumaneArgs>): Humane;

        log(message: string | string[], callback?: () => void): Humane;
        log(message: string | string[], options?: HumaneOptions, callback?: () => void): Humane;

        spawn(): (message: string | string[], callback?: () => void) => Humane;
        spawn(): (message: string | string[], options?: HumaneOptions, callback?: () => void) => Humane;

        remove(callback?: () => void): void;
    }

    function log(message: string | string[], callback?: () => void): Humane;
    function log(message: string | string[], options?: HumaneOptions, callback?: () => void): Humane;

    /**
     * Create a completely new instance of Humane.
     */
    function create(args?: HumaneArgs): Humane;

    /**
     * Create a custom notifier.
     */
    function spawn(): (message: string | string[], callback?: () => void) => Humane;
    function spawn(): (message: string | string[], options?: HumaneOptions, callback?: () => void) => Humane;

    /**
     * Force remove current notification, takes an optional callback fired when finished (note each instance has its own remove)
     */
    function remove(callback?: () => void): void;
}