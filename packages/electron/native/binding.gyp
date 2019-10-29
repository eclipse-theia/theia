{
    'targets': [{
        'defines': ['NAPI_VERSION=2'],
        'target_name': 'ffmpeg',
        'sources': [
            'src/ffmpeg.c',
        ],
        'conditions': [
            ['OS=="linux"', {
                'sources': [
                    'src/linux-ffmpeg.c',
                ],
                'libraries': [
                    '-ldl',
                ]
            }],
            ['OS=="mac"', {
                'sources': [
                    'src/mac-ffmpeg.c',
                ]
            }],
            ['OS=="win"', {
                'sources': [
                    'src/win-ffmpeg.c',
                ]
            }],
        ],
    }],
}
