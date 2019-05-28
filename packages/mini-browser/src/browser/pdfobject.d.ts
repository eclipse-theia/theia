/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

/**
 * The documentation was copied from https://pdfobject.com/#api.
 * License: MIT (https://pipwerks.mit-license.org)
 */
declare module 'pdfobject' {

    interface Options {

        /**
         * Alias for PDF Open Parameters "page" option.
         * Any number entered here will cause the PDF be opened to the specified page number (if the browser supports it). If left unspecified, the PDF will open on page 1.
         */
        readonly page?: string;

        /**
         * Any string entered here will be appended to the generated <embed> element as the ID.
         * If left unspecified, no ID will be appended.
         */
        readonly id?: string;

        /**
         * Will insert the width as an inline style via the style attribute on the <embed> element.
         * If left unspecified, `PDFObject` will default to `100%`. Is standard CSS, supports all units, including `px`, `%`, `em`, and `rem`.
         */
        readonly width?: string;

        /**
         * Will insert the height as an inline style via the style attribute on the target element.
         * If left unspecified, `PDFObject` will default to `100%`. Is standard CSS, supports all units, including `px`, `%`, `em`, and `rem`.
         */
        readonly height?: string;

        /**
         * Any string entered here will be inserted into the target element when the browser doesn't support inline PDFs.
         *
         * **Default**: `"<p>This browser does not support inline PDFs. Please download the PDF to view it: <a href='[url]'>Download PDF</a></p>"`.
         * Supports HTML. Use the shortcode `[url]` to insert the URL of the PDF (as specified via the URL parameter in the `embed()` method).
         * Entering `false` will disable the fallback text option and prevent `PDFObject` from inserting fallback text.
         */
        readonly fallbackLink?: string | boolean;

        /**
         * Allows you to specify Adobe's PDF Open Parameters.
         *
         * **Warning**: These are proprietary and not well supported outside of Adobe products.
         * Most PDF readers support the page parameter, but not much else. `PDF.js` supports `page`, `zoom`, `nameddest`, and `pagemode`.
         */
        readonly pdfOpenParams?: {
            readonly page?: string;
            readonly zoom?: string;
            readonly nameddest?: string;
            readonly pagemode?: string;
        }
    }

    interface PDFObject {

        /**
         * Returns the embedded element (`<embed>` for most situations, and `<iframe>` when integrated with PDF.js), or `false` if unable to embed.
         *
         * The heart of `PDFObject`, the embed method provides a ton of functionality and flexibility.
         */
        embed(url: string, target?: string | HTMLElement /* | jQuery object (HTML node) for target */, options?: Options): HTMLElement;

        /**
         * Returns the version of PDFObject.
         */
        readonly pdfobjectversion: string;

        /**
         * Returns `true` or `false` based on detection of `navigator.mimeTypes['application/pdf']` and/or ActiveX `AcroPDF.PDF` or `PDF.PdfCtrl`.
         *
         * `PDFObject` does not perform detection for specific vendors (Adobe Reader, FoxIt, PDF.js, etc.).
         * Note: For those who wish to target PDF.js, there is an option in `PDFObject.embed()` to force use of PDF.js.
         */
        readonly supportsPDFs: boolean;
    }

    const pdfObject: PDFObject;

    export = pdfObject;

}
