{
    'targets': [{
        'target_name': 'electron-ffmpeg-codecs',
        'type': 'executable',
        'sources': [
            'src/electron-ffmpeg-codecs.c',
        ],
        'libraries': [
            "<!@(node -p \"require('../electron-ffmpeg-lib.js').libffmpegGypLibraryPath()\")",
        ],
    }],
}
