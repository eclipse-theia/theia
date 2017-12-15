/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

export const NOTIFICATIONS_CONTAINER = 'theia-NotificationsContainer';
export const NOTIFICATION = 'theia-Notification';
export const ICON = 'icon';
export const TEXT = 'text';
export const BUTTONS = 'buttons';

export interface NotificationAction {
    label: string;
    fn: (element: Notification) => void;
}

export interface NotificationProperties {
    icon: string;
    text: string;
    actions?: NotificationAction[];
}

export interface Notification {
    properties: NotificationProperties;
    element: Element;
}

export class Notifications {

    protected container: Element;

    constructor(protected parent?: Element) {
        this.parent = parent || document.body;
        this.container = this.createNotificationsContainer(this.parent);
    }

    show(properties: NotificationProperties): void {
        const notificationElement = this.createNotificationElement(properties);
        this.container.appendChild(notificationElement);
    }

    protected createNotificationsContainer(parentContainer: Element): Element {
        const container = document.createElement('div');
        container.classList.add(NOTIFICATIONS_CONTAINER);
        return parentContainer.appendChild(container);
    }

    protected createNotificationElement(properties: NotificationProperties): Node {
        const fragment = document.createDocumentFragment();
        const element = fragment.appendChild(document.createElement('div'));
        element.classList.add(NOTIFICATION);
        const iconContainer = element.appendChild(document.createElement('div'));
        iconContainer.classList.add(ICON);
        const icon = iconContainer.appendChild(document.createElement('i'));
        icon.classList.add('fa', this.toIconClass(properties.icon), 'fa-fw', properties.icon);
        const textContainer = element.appendChild(document.createElement('div'));
        textContainer.classList.add(TEXT);
        const text = textContainer.appendChild(document.createElement('p'));
        text.innerText = properties.text;
        const close = () => {
            element.remove();
        };
        const handler = <Notification>{ element, properties };
        const buttons = element.appendChild(document.createElement('div'));
        buttons.classList.add(BUTTONS);
        if (!!properties.actions) {
            for (const action of properties.actions) {
                const button = buttons.appendChild(document.createElement('button'));
                button.innerText = action.label;
                button.addEventListener('click', () => {
                    action.fn(handler);
                    close();
                });
            }
        }
        return fragment;
    }

    protected toIconClass(icon: string): string {
        if (icon === 'error') {
            return 'fa-times-circle';
        }
        if (icon === 'warning') {
            return 'fa-warning';
        }
        return 'fa-info-circle';
    }

}
