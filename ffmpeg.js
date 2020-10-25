const path = require('path');
const process = require('process');
const child_process = require('child_process');

function parse_duration(str) {
	// Duration is in the form HH:MM:SS.fraction
	let parts = str.split(":");
	for (let idx = 0; idx < parts.length; idx++) {
		parts[idx] = parseFloat(parts[idx]);
	}
	return ((parts[0] * 60) + parts[1]) * 60 + parts[2];
}

class ffmpeg {
	constructor(ffpath) {
		// Figure out the location of FFmpeg
		if (!ffpath)
			ffpath = process.cwd();
		this.bin = {
			ffmpeg: path.join(ffpath, "bin/ffmpeg.exe"),
			ffprobe: path.join(ffpath, "bin/ffprobe.exe")
		};
	}

	_probeParse(buffer) {
		let parsed = JSON.parse(buffer);
		if (parsed.streams && (parsed.streams.length > 0)) {
			for (let idx = 0; idx < parsed.streams.length; idx++) {
				let stream = parsed.streams[idx];
				if (stream.tags && stream.tags["DURATION"]) {
					stream.duration = parse_duration(stream.tags["DURATION"]);
				}
			}
		}
		return parsed;
	}

	probeSync(file) {
		let result = child_process.spawnSync(this.bin.ffprobe,
			[
				"-hide_banner",
				"-v", "quiet",
				"-print_format", "json",
				"-show_format",
				"-show_streams",
				"-i", file
			]
		);
		return this._probeParse(result.stdout);
	}

	probe(file) {
		return new Promise((resolve, reject) => {
			let proc = child_process.spawn(this.bin.ffprobe,
				[
					"-hide_banner",
					"-v", "quiet",
					"-print_format", "json",
					"-show_format",
					"-show_streams",
					"-i", file
				],
				{stdio: ['pipe', 'pipe', 'pipe']}
			);
			let buffer = "";
			proc.stdout.on('data', (data) => {
				buffer += data.toString();
			});
			proc.on('close', (code, signal) => {
				if (code == 0) {
					try {
						resolve(this._probeParse(buffer));
					} catch (ex) {
						reject(ex);
					}
				} else {
					if (code == null) {
						reject(signal);
					} else {
						reject(code);
					}					
				}
			});
			proc.on('error', (error) => {
				reject(error);
			})
		});
	}

	get_encoder_caps(encoder) {
		let result = {
			hardware: false,
			formats: [],
			devices: []
		};

		// Output is a list of options.
		let temp = child_process.execFileSync(this.bin.ffmpeg,
			[
				"-hide_banner",
				"-v", "quiet",
				"-h", `encoder=${encoder}`
			]
		).toString();
		let lines = temp.split('\r\n');
		for (let line of lines) {
			if (line.includes("General capabilities:")) {
				result.hardware = (line.includes("hardware"));
			} else if (line.includes("Supported hardware devices:")) {
				let data = line.substr(line.indexOf(':') + 2);
				result.devices = data.split(' ');
			} else if (line.includes("Supported pixel formats:")) {
				let data = line.substr(line.indexOf(':') + 2);
				result.formats = data.split(' ');
			}
		}
		return result;
	}

	ffmpegSync(params) {
		return child_process.spawnSync(this.bin.ffmpeg, params);
	}

	ffmpeg(params) {
		return new Promise((resolve, reject) => {
			let proc = child_process.spawn(this.bin.ffmpeg, params);
			let buf_stdout = "";
			let buf_stderr = "";
			proc.stdout.on('data', (data) => {
				buf_stdout += data.toString();
			});
			proc.stderr.on('data', (data) => {
				buf_stderr += data.toString();
			});
			proc.on('close', (code, signal) => {
				if (code == 0) {
					try {
						resolve([code, buf_stdout, buf_stderr]);
					} catch (ex) {
						reject([ex, buf_stdout, buf_stderr]);
					}
				} else {
					if (code == null) {
						reject([signal, buf_stdout, buf_stderr]);
					} else {
						reject([code, buf_stdout, buf_stderr]);
					}					
				}
			});
			proc.on('error', (error) => {
				reject([error, buf_stdout, buf_stderr]);
			})
		});
	}
}

module.exports = ffmpeg;
