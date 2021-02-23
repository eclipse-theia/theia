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

import { injectable } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { ThemeService, Theme } from '@theia/core/lib/browser/theming';
import { IconUrl } from '../../common/plugin-protocol';
import { Reference, SyncReferenceCollection } from '@theia/core/lib/common/reference';
import { Endpoint } from '@theia/core/lib/browser/endpoint';

export interface PluginIconKey {
    url: IconUrl
    size: number
}

export interface PluginIcon extends Disposable {
    readonly iconClass: string
}

@injectable()
export class PluginSharedStyle {

    protected style: HTMLStyleElement;
    protected readonly rules: {
        selector: string;
        body: (theme: Theme) => string
    }[] = [];

    constructor() {
        this.update();
        ThemeService.get().onThemeChange(() => this.update());
    }

    protected readonly toUpdate = new DisposableCollection();
    protected update(): void {
        this.toUpdate.dispose();

        const style = this.style = document.createElement('style');
        style.type = 'text/css';
        style.media = 'screen';
        document.getElementsByTagName('head')[0].appendChild(style);
        this.toUpdate.push(Disposable.create(() =>
            document.getElementsByTagName('head')[0].removeChild(style)
        ));

        for (const rule of this.rules) {
            this.doInsertRule(rule);
        }
    }

    insertRule(selector: string, body: (theme: Theme) => string): Disposable {
        const rule = { selector, body };
        this.rules.push(rule);
        this.doInsertRule(rule);
        return Disposable.create(() => {
            const index = this.rules.indexOf(rule);
            if (index !== -1) {
                this.rules.splice(index, 1);
                this.deleteRule(selector);
            }
        });
    }
    protected doInsertRule({ selector, body }: {
        selector: string;
        body: (theme: Theme) => string
    }): void {
        const sheet = (<CSSStyleSheet>this.style.sheet);
        const cssBody = body(ThemeService.get().getCurrentTheme());
        sheet.insertRule(selector + ' {\n' + cssBody + '\n}', 0);
    }
    deleteRule(selector: string): void {
        const sheet = (<CSSStyleSheet>this.style.sheet);
        const rules = sheet.rules || sheet.cssRules || [];
        for (let i = rules.length - 1; i >= 0; i--) {
            const rule = rules[i];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((<any>rule).selectorText.indexOf(selector) !== -1) {
                sheet.deleteRule(i);
            }
        }
    }

    private readonly icons = new SyncReferenceCollection<PluginIconKey, PluginIcon>(key => this.createPluginIcon(key));
    toIconClass(url: IconUrl, { size }: { size: number } = { size: 16 }): Reference<PluginIcon> {
        return this.icons.acquire({ url, size });
    }

    private iconSequence = 0;
    protected createPluginIcon(key: PluginIconKey): PluginIcon {
        const iconUrl = key.url;
        const size = key.size;
        const darkIconUrl = PluginSharedStyle.toExternalIconUrl(`${typeof iconUrl === 'object' ? iconUrl.dark : iconUrl}`);
        const lightIconUrl = PluginSharedStyle.toExternalIconUrl(`${typeof iconUrl === 'object' ? iconUrl.light : iconUrl}`);
        const iconClass = 'plugin-icon-' + this.iconSequence++;
        const toDispose = new DisposableCollection();
        toDispose.push(this.insertRule('.' + iconClass, theme => `
                display: inline-block;
                background-position: 2px;
                width: ${size}px;
                height: ${size}px;
                background: no-repeat url("${theme.type === 'light' ? lightIconUrl : darkIconUrl}");
                background-size: ${size}px;
            `));
        return {
            iconClass,
            dispose: () => toDispose.dispose()
        };
    }

    static toExternalIconUrl(iconUrl: string): string {
        if (iconUrl.startsWith('hostedPlugin/')) {
            return new Endpoint({ path: iconUrl }).getRestUrl().toString();
        }
        return iconUrl;
    }

}
