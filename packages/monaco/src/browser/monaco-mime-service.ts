/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import debounce = require('@theia/core/shared/lodash.debounce');
import { injectable } from '@theia/core/shared/inversify';
import { MimeAssociation, MimeService } from '@theia/core/lib/browser/mime-service';

@injectable()
export class MonacoMimeService extends MimeService {

    protected associations: MimeAssociation[] = [];
    protected updatingAssociations = false;

    constructor() {
        super();
        monaco.services.StaticServices.modeService.get()._onLanguagesMaybeChanged.event(() => {
            if (this.updatingAssociations) {
                return;
            }
            this.updateAssociations();
        });
    }

    setAssociations(associations: MimeAssociation[]): void {
        this.associations = associations;
        this.updateAssociations();
    }

    protected updateAssociations = debounce(() => {
        this.updatingAssociations = true;
        try {
            monaco.mime.clearTextMimes(true);

            for (const association of this.associations) {
                const mimetype = this.getMimeForMode(association.id) || `text/x-${association.id}`;
                monaco.mime.registerTextMime({ id: association.id, mime: mimetype, filepattern: association.filepattern, userConfigured: true }, false);
            }

            monaco.services.StaticServices.modeService.get()._onLanguagesMaybeChanged.fire(undefined);
        } finally {
            this.updatingAssociations = false;
        }
    });

    protected getMimeForMode(langId: string): string | undefined {
        for (const language of monaco.languages.getLanguages()) {
            if (language.id === langId && language.mimetypes) {
                return language.mimetypes[0];
            }
        }

        return undefined;
    }
}
