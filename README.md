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

## Further Information
* [Configuration Information](https://github.com/Xaymar/video-encoding-samples/wiki/Configuration)