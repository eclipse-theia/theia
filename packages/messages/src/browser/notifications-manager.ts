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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { MessageClient, MessageType, Message as PlainMessage, ProgressMessage, ProgressUpdate, CancellationToken } from '@theia/core/lib/common';
import { deepClone } from '@theia/core/lib/common/objects';
import { Emitter } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { Md5 } from 'ts-md5';
import throttle = require('@theia/core/shared/lodash.throttle');
import { NotificationPreferences } from './notification-preferences';
import { ContextKeyService, ContextKey } from '@theia/core/lib/browser/context-key-service';
import { OpenerService } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { NotificationContentRenderer } from './notification-content-renderer';

export interface NotificationUpdateEvent {
    readonly notifications: Notification[];
    readonly toasts: Notification[];
    readonly visibilityState: Notification.Visibility;
}

export interface Notification {
    messageId: string;
    message: string;
    source?: string;
    expandable: boolean;
    collapsed: boolean;
    type: Notification.Type;
    actions: string[];
    progress?: number;
}
export namespace Notification {
    export type Visibility = 'hidden' | 'toasts' | 'center';
    export type Type = 'info' | 'warning' | 'error' | 'progress';
}

@injectable()
export class NotificationManager extends MessageClient {

    @inject(NotificationPreferences)
    protected readonly preferences: NotificationPreferences;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    @inject(NotificationContentRenderer)
    protected readonly contentRenderer: NotificationContentRenderer;

    protected readonly onUpdatedEmitter = new Emitter<NotificationUpdateEvent>();
    readonly onUpdated = this.onUpdatedEmitter.event;
    protected readonly fireUpdatedEvent = throttle(() => {
        const notifications = deepClone(Array.from(this.notifications.values()).filter((notification: Notification) =>
            notification.message
        ));
        const toasts = deepClone(Array.from(this.toasts.values()).filter((toast: Notification) =>
            toast.message
        ));
        const visibilityState = this.visibilityState;
        this.onUpdatedEmitter.fire({ notifications, toasts, visibilityState });
    }, 250, { leading: true, trailing: true });

    protected readonly deferredResults = new Map<string, Deferred<string | undefined>>();
    protected readonly notifications = new Map<string, Notification>();
    protected readonly toasts = new Map<string, Notification>();

    protected notificationToastsVisibleKey: ContextKey<boolean>;
    protected notificationCenterVisibleKey: ContextKey<boolean>;

    @postConstruct()
    protected async init(): Promise<void> {
        this.notificationToastsVisibleKey = this.contextKeyService.createKey<boolean>('notificationToastsVisible', false);
        this.notificationCenterVisibleKey = this.contextKeyService.createKey<boolean>('notificationCenterVisible', false);
    }
    protected updateContextKeys(): void {
        this.notificationToastsVisibleKey.set(this.toastsVisible);
        this.notificationCenterVisibleKey.set(this.centerVisible);
    }

    get toastsVisible(): boolean {
        return this.visibilityState === 'toasts';
    }
    get centerVisible(): boolean {
        return this.visibilityState === 'center';
    }
    protected visibilityState: Notification.Visibility = 'hidden';
    protected setVisibilityState(newState: Notification.Visibility): void {
        const changed = this.visibilityState !== newState;
        this.visibilityState = newState;
        if (changed) {
            this.fireUpdatedEvent();
            this.updateContextKeys();
        }
    }

    hideCenter(): void {
        this.setVisibilityState('hidden');
    }
    toggleCenter(): void {
        this.setVisibilityState(this.centerVisible ? 'hidden' : 'center');
    }

    accept(notification: Notification | string, action: string | undefined): void {
        const messageId = this.getId(notification);
        if (!messageId) {
            return;
        }
        this.notifications.delete(messageId);
        this.toasts.delete(messageId);
        const result = this.deferredResults.get(messageId);
        if (!result) {
            return;
        }
        this.deferredResults.delete(messageId);
        if (this.centerVisible && this.notifications.size === 0) {
            this.visibilityState = 'hidden';
        }
        result.resolve(action);
        this.fireUpdatedEvent();
    }
    protected find(notification: Notification | string): Notification | undefined {
        return typeof notification === 'string' ? this.notifications.get(notification) : notification;
    }
    protected getId(notification: Notification | string): string {
        return typeof notification === 'string' ? notification : notification.messageId;
    }

    hide(): void {
        if (this.toastsVisible) {
            this.toasts.clear();
        }
        this.setVisibilityState('hidden');
    }

    clearAll(): void {
        this.setVisibilityState('hidden');
        Array.from(this.notifications.values()).forEach(n => this.clear(n));
    }

    clear(notification: Notification | string): void {
        this.accept(notification, undefined);
    }

    toggleExpansion(notificationId: string): void {
        const notification = this.find(notificationId);
        if (!notification) {
            return;
        }
        notification.collapsed = !notification.collapsed;
        this.fireUpdatedEvent();
    }

    showMessage(plainMessage: PlainMessage): Promise<string | undefined> {
        const messageId = this.getMessageId(plainMessage);

        let notification = this.notifications.get(messageId);
        if (!notification) {
            const message = this.contentRenderer.renderMessage(plainMessage.text);
            const type = this.toNotificationType(plainMessage.type);
            const actions = Array.from(new Set(plainMessage.actions));
            const source = plainMessage.source;
            const expandable = this.isExpandable(message, source, actions);
            const collapsed = expandable;
            notification = { messageId, message, type, actions, expandable, collapsed };
            this.notifications.set(messageId, notification);
        }
        const result = this.deferredResults.get(messageId) || new Deferred<string | undefined>();
        this.deferredResults.set(messageId, result);

        if (!this.centerVisible) {
            this.toasts.delete(messageId);
            this.toasts.set(messageId, notification);
            this.startHideTimeout(messageId, this.getTimeout(plainMessage));
            this.setVisibilityState('toasts');
        }
        this.fireUpdatedEvent();
        return result.promise;
    }
    protected hideTimeouts = new Map<string, number>();
    protected startHideTimeout(messageId: string, timeout: number): void {
        if (timeout > 0) {
            this.hideTimeouts.set(messageId, window.setTimeout(() => {
                this.hideToast(messageId);
            }, timeout));
        }
    }
    protected hideToast(messageId: string): void {
        this.toasts.delete(messageId);
        if (this.toastsVisible && !this.toasts.size) {
            this.setVisibilityState('hidden');
        } else {
            this.fireUpdatedEvent();
        }
    }
    protected getTimeout(plainMessage: PlainMessage): number {
        if (plainMessage.actions && plainMessage.actions.length > 0) {
            // Ignore the timeout if at least one action is set, and we wait for user interaction.
            return 0;
        }
        return plainMessage.options && plainMessage.options.timeout || this.preferences['notification.timeout'];
    }
    protected isExpandable(message: string, source: string | undefined, actions: string[]): boolean {
        if (!actions.length && source) {
            return true;
        }
        return message.length > 500;
    }
    protected toNotificationType(type?: MessageType): Notification.Type {
        switch (type) {
            case MessageType.Error:
                return 'error';
            case MessageType.Warning:
                return 'warning';
            case MessageType.Progress:
                return 'progress';
            default:
                return 'info';
        }
    }
    protected getMessageId(m: PlainMessage): string {
        return String(Md5.hashStr(`[${m.type}] ${m.text} : ${(m.actions || []).join(' | ')};`));
    }

    async showProgress(messageId: string, plainMessage: ProgressMessage, cancellationToken: CancellationToken): Promise<string | undefined> {
        let notification = this.notifications.get(messageId);
        if (!notification) {
            const message = this.contentRenderer.renderMessage(plainMessage.text);
            const type = this.toNotificationType(plainMessage.type);
            const actions = Array.from(new Set(plainMessage.actions));
            const source = plainMessage.source;
            const expandable = this.isExpandable(message, source, actions);
            const collapsed = expandable;
            notification = { messageId, message, type, actions, expandable, collapsed };
            this.notifications.set(messageId, notification);

            notification.progress = 0;
            cancellationToken.onCancellationRequested(() => {
                this.accept(messageId, ProgressMessage.Cancel);
            });
        }
        const result = this.deferredResults.get(messageId) || new Deferred<string | undefined>();
        this.deferredResults.set(messageId, result);

        if (!this.centerVisible) {
            this.toasts.set(messageId, notification);
            this.setVisibilityState('toasts');
        }
        this.fireUpdatedEvent();
        return result.promise;
    }

    async reportProgress(messageId: string, update: ProgressUpdate, originalMessage: ProgressMessage, cancellationToken: CancellationToken): Promise<void> {
        const notification = this.find(messageId);
        if (!notification) {
            return;
        }
        if (cancellationToken.isCancellationRequested) {
            this.clear(messageId);
        } else {
            notification.message = originalMessage.text && update.message ? `${originalMessage.text}: ${update.message}` :
                originalMessage.text || update?.message || notification.message;
            notification.progress = this.toPlainProgress(update) || notification.progress;
        }
        this.fireUpdatedEvent();
    }
    protected toPlainProgress(update: ProgressUpdate): number | undefined {
        return update.work && Math.min(update.work.done / update.work.total * 100, 100);
    }

    async openLink(link: string): Promise<void> {
        const uri = new URI(link);
        const opener = await this.openerService.getOpener(uri);
        opener.open(uri);
    }

}
