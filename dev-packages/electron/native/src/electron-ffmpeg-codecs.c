/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

// This program must be linked against the ffmpeg library.

#include <stdio.h>

// ffmpeg data
enum AVMediaType
{
    AVMEDIA_TYPE_UNKNOWN = -1, ///< Usually treated as AVMEDIA_TYPE_DATA
};

// ffmpeg data
enum AVCodecID
{
    AV_CODEC_ID_H264 = 27,
};

// ffmpeg data
typedef struct
{
    const char *name, *long_name;
    enum AVMediaType type;
    enum AVCodecID id;

} AVCodec;

// ffmpeg functions
void avcodec_register_all(void);
AVCodec *av_codec_next(const AVCodec *c);

void output_json_entry(AVCodec *codec)
{
    fprintf(stdout, "{\"id\":%d,\"name\":\"%s\",\"longName\":\"%s\"}",
            codec->id, codec->name, codec->long_name);
}

int main()
{
    avcodec_register_all();
    AVCodec *codec = av_codec_next(NULL);
    fprintf(stdout, "[");
    while (1)
    {
        output_json_entry(codec);
        codec = av_codec_next(codec);
        if (codec != NULL)
            printf(",");
        else
            break;
    }
    fprintf(stdout, "]\n");
    return 0;
}
