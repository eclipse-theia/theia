#ifndef FFMPEG_H
#define FFMPEG_H
/**
 * THIS FILE REDEFINES DATA AS RETURNED BY THE FFMPEG LIBRARY.
 * HEADER FILES ARE NOT DISTRIBUTED IN OUR SETUP, HENCE THIS.
 */

/**
 * https://github.com/FFmpeg/FFmpeg/blob/release/3.2/libavutil/avutil.h#L193-L201
 */
enum AVMediaType
{
    _UNKNOWN_DATA_AVMediaType = -1,
};

/**
 * https://github.com/FFmpeg/FFmpeg/blob/release/3.2/libavcodec/avcodec.h#L191-L653
 */
enum AVCodecID
{
    __UNKNOWN_DATA_AVCodecID = 0,
};

/**
 * https://github.com/FFmpeg/FFmpeg/blob/release/3.2/libavcodec/avcodec.h#L3611-L3721
 */
struct AVCodec
{
    const char *name, *long_name;
    enum AVMediaType type;
    enum AVCodecID id;
};

/**
 * https://github.com/FFmpeg/FFmpeg/blob/release/3.2/libavcodec/avcodec.h#L660-L688
 */
struct AVCodecDescriptor
{
    enum AVCodecID id;
    enum AVMediaType type;
    const char *name, *long_name;
};

/**
 * Wrapper around the ffmpeg library that must be loaded at runtime.
 */
struct FFMPEG_Library
{
    void *handle;

    /**
     * https://github.com/FFmpeg/FFmpeg/blob/release/3.2/libavcodec/avcodec.h#L6228
     *
     * We use AVCodecDescriptor because it is the only structure that we can
     * query on all platforms. Windows' ffmpeg.dll does not export a
     * `av_codec_next` function, only `avcodec_descriptor_next`.
     * Also it seems that this "descriptor" concept is the recommended API.
     */
    struct AVCodecDescriptor *(*avcodec_descriptor_next)(const struct AVCodecDescriptor *);

    /**
     * https://github.com/FFmpeg/FFmpeg/blob/release/3.2/libavcodec/avcodec.h#L4646
     */
    struct AVCodec *(*avcodec_find_decoder)(enum AVCodecID);
};

#define NULL_FFMPEG_LIBRARY \
    (struct FFMPEG_Library) { NULL, NULL, NULL }

/**
 * Loader that will inject the loaded functions into a FFMPEG_Library structure.
 */
char *load_ffmpeg_library(struct FFMPEG_Library *library, char *library_path);

/**
 * Free library.
 */
char *unload_ffmpeg_library(struct FFMPEG_Library *library);

#endif // FFMPEG_H guard
