/********************************************************************************
 * Copyright (C) 2020 TORO Limited and others.
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

import { ReactWidget } from '@theia/core/lib/browser';
import { injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';

/**
 * This sample view is used to demo the behavior of "Widget.title.closable".
 */
@injectable()
export class SampleViewUnclosableView extends ReactWidget {
  static readonly ID = 'sampleUnclosableView';

  @postConstruct()
  init(): void {
    this.id = SampleViewUnclosableView.ID;
    this.title.caption = 'Sample Unclosable View';
    this.title.label = 'Sample Unclosable View';
    this.title.iconClass = 'fa fa-window-maximize';
    this.title.closable = false;
    this.update();
  }

  protected render(): React.ReactNode {
    return (
      <div>
        Closable
        <input type="checkbox" defaultChecked={this.title.closable} onChange={e => this.title.closable = e.target.checked} />
      </div>
    );
  }
}
