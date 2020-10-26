# Video Encoding Samples
Video Encoding Samples (VES) is a project to determine the ideal (or even best) settings for any available encoder through comparison with [VMAF](https://github.com/Netflix/vmaf), SSIM and PSNR. It was previously used to generate the data shown on [the old website](https://ves.xaymar.com/1.0/) which will eventually be replaced by new, up to date information.

## Requirements
* A CPU with 4 Cores & 8 Threads, or 6 Cores & 6 Threads.
* Any of the compatible Operating Systems:
    * Windows 10 64 bit
	* Windows 7 64 bit
* [Node.JS v15.0 or newer](https://nodejs.org/en/download/current/)
* [FFmpeg](https://github.com/Xaymar/video-encoding-samples/releases/download/0.1.0/ffmpeg.7z)
* [VMAF Model "4K RB v0.6.2"](https://github.com/Netflix/vmaf/tree/master/model/vmaf_4k_rb_v0.6.2)
* Any number of input Videos
* A lot of time.

## Usage
The tool currently has no special parameters and reads its entire configuration from the `config.json` file, so you can invoke it by calling node.js with the script argument:

* Default (usually fits): `node ./ves.js`
* Or for larger configuraitons: `node --max-old-space-size=8192 ./ves.js`

## Installation
1. Grab the latest release source code (or just master source code) and extract it to any directory.
2. Install the latest FFmpeg versions for your platform that supports libvmaf (or built it yourself):
    * Windows: Extract [this archive](https://github.com/Xaymar/video-encoding-samples/releases/download/0.1.0/ffmpeg.7z) into `ffmpeg/`.
	* Linux (apt): `apt-get install ffmpeg`
3. Grab the recommended model (see requirements) and place it into `ffmpeg/vmaf/`.
    * It is possible to use different models, however this model has so far given the most accurate results.
4. Put any source video files in `videos/`.
    * Videos must be properly tagged or they will be treated as bt709/bt709/bt709/tv.
	* Video files must be in .mkv format.
5. Adjust the `config.json` file to your needs.
6. Run the tool.

## Configuration
The tool comes with a relatively simple configuration based on the JSON format. Almost every aspect of the tool is configurable.

### Paths
#### paths.ffmpeg
Where to find both the FFmpeg binaries as well as the VMAF model directory.

#### paths.videos
The location of the video files used as input.

#### paths.cache
Where to store the intermediate cache videos to speed up the encoding process and waste less energy and time on identical work.

#### paths.output
The directory to store the resulting .JSON files in that VMAF generates.

### Encoders
An object of encoder objects with the structure:
```
"encoder_name": {
	<options>
}
```

#### encoders.\<encoder\>.enabled
Enable or disable a certain encoder. Enabled encoders will be ignored if they are not supported by the tool or FFmpeg binary.

#### encoders.\<encoder\>.pool
The resource pool to put this encoder into in order to prevent 

### Encoder: libx264
#### encoders.libx264.cost_scale

#### encoders.libx264.threads
The number of threads to let libx264 to use. If this is reduced below 32 or increased above 32, the cost for an encode is adjusted by the formula `cost *= (32.0 / n)`, as the original cost measurements were done at 32 threads.

#### encoders.libx264.presets

#### encoders.libx264.tunes

#### encoders.libx264.scenecut

### Encoder: h264_nvenc
#### encoders.h264_nvenc.parallel
The maximum amount of encodes of this type to run in parallel.

#### encoders.h264_nvenc.gpu
The GPU index to run h264_nvenc on, or `-1` to automatically select. You can figure out the proper index with the following FFmpeg command:
```
ffmpeg -hide_banner -f lavfi -i color=size=64x64:duration=1:rate=30:color=black -c:v h264_nvenc -gpu -2 -an -f null -
```

#### encoders.h264_nvenc.presets
Array of arguments to the `-preset` option. 

#### encoders.h264_nvenc.tunes
Array of arguments to the `-tune` option, or `null` if the option should be omitted.

#### encoders.h264_nvenc.rc-lookahead
Array of arguments to the `-rc-lookahead` option, which controls the number of frames to look into the future.

#### encoders.h264_nvenc.bframes
Array of arguments to the `-bf` option, controlling the maximum amount of B-Frames to insert. If `rc-lookahead` is set to 0, controls the absolute number of B-Frames to insert.

#### encoders.h264_nvenc.bframe_reference_mode
Array of arguments to the `-b_ref_mode` option. 

#### encoders.h264_nvenc.scenecut
Array of boolean options where `true` enables scenecut if `rc-lookahead` is greater than 0, and `false` disables it always.

### Videos
An object of video objects with the structure:
```
"file_base_name": {
	<options>
}
```

#### videos.\<video\>.enabled
Enable or disable a certain video. Missing videos are ignored.

### Options
#### options.transcode.format
The pixel format to transcode to. The current common streaming and VoD format is `yuv420p` or `nv12`.

#### options.transcode.color.matrix
Color Matrix to use for transcoded files.

#### options.transcode.color.trc
Transfer Characteristics to use for transcoded files.

#### options.transcode.color.primaries
Color Primaries to use for transcoded files.

#### options.transcode.color.range
Color range to use for transcoded files.

#### options.vmaf.model
Model that VMAF is using, relative to the `<config.paths.ffmpeg>/vmaf/` directory. May not contain special symbols.

#### options.vmaf.threads
Number of threads that VMAF is allowed to use. 

#### options.resolutions
Array of resolutions (`[Width, Height]`) to transcode to. Only the first element of the inner array is used, the height is calculated from the input video's aspect ratio.

#### options.framerate_scalings
Array of numbers to scale the framerate by. Values should be kept below 1.0, as values above 1.0 simply introduce duplicated frames and do not magically generate new information.

#### options.bitrates
Array of numbers to use as possible bitrates.

#### options.keyframeinterval
Array of numbers to multiply with the framerate to determine the keyframe interval with.
