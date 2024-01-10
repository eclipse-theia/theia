{
    'targets': [{
        'defines': ['NAPI_VERSION=2'],
        'target_name': 'ffmpeg',
        'sources': [
            'native/ffmpeg.c',
        ],
        'conditions': [
            ['OS=="linux"', {
                'sources': [
                    'native/linux-ffmpeg.c',
                ],
                'libraries': [
                    '-ldl',
                ]
            }],
            ['OS=="mac"', {
                'sources': [
                    'native/mac-ffmpeg.c',
                ]
            }],
            ['OS=="win"', {
                'sources': [
                    'native/win-ffmpeg.c',
                ]
            }],
        ],
    }],
}
