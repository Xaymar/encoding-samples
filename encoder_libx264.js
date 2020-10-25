const encoder = require('./encoder.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let version = 1;

class libx264 extends encoder {
	constructor(ffmpeg, config, settings) {
		super(ffmpeg, config, settings);
		
		// Cost per option chosen.
		this.cost = {
			preset: { // Measured at 2560x1440x60 with no tune
				"ultrafast": 0.603,	// 520 fps / 30 fps, 116 fps / 60 fps
				"superfast": 0.686,	// 383 fps / 30 fps, 102 fps / 60 fps
				"veryfast":  0.737,	// 378 fps / 30 fps, 95 fps / 60 fps
				"faster":    0.854,	// 339 fps / 30 fps, 82 fps / 60 fps 
				"fast":      0.972,	// 334 fps / 30 fps, 72 fps / 60 fps
				"medium":    1.000,	// 368 fps / 30 fps, 70 fps / 60 fps
				"slow":      1.321,	// 359 fps / 30 fps, 53 fps / 60 fps
				"slower":    2.414,	// 329 fps / 30 fps, 29 fps / 60 fps
				"veryslow":  4.667,	// 270 fps / 30 fps, 15 fps / 60 fps
				"placebo":   18.42,	// 125 fps / 30 fps, 3.8 fps / 60 fps
			},
			tune: { // Measured at 2560x1440x60 medium
				null:        1.000,	// 70 fps / 60 fps
				"film":      1.029,	// 68 fps / 60 fps
				"animation": 1.077,	// 65 fps / 60 fps
				"grain":     1.061,	// 66 fps / 60 fps
			},
			threads: (32.0 / this.settings.threads),
		}
	}
	
	available() {
		console.time("Checking...");
		let res = this.ffmpeg.ffmpegSync([
			"-hide_banner", "-v", "error",
			"-f", "lavfi",
			"-i", "color=size=256x256:duration=1:rate=30:color=black",
			"-c:v", "libx264",
			"-f", "null",
			"-"
		]);
		console.timeEnd("Checking...");
		if (res.status != 0) {
			return false;
		}
		return true;
	}
	
	load() {
		let name = function(opts) {
			let name = "";
			for (let idx = 0; idx < opts.length; idx += 2) {
				let opt = opts[idx];
				let val = opts[idx + 1];		
				if (name.length != 0)
					name += ";";
				name += `${opt.substr(1)}=${val}`;
			}
			return `${name};version=${version}`;
		}

		console.time("Generating...");
		this.indexes = {};
		this.combinations = [];
		for (let preset of this.settings.presets) {
			for (let tune of this.settings.tunes) {
				let _opts = [
					"-profile:v", "high",
					"-preset", preset,
					"-x264-params", `nal-hrd=cbr:force-cfr=1`,
					"-ssim", "0",
					"-threads", this.settings.threads,
				];
				if (tune) {
					_opts.push("-tune", tune);
				}

				let _name = name(_opts);
				let _hash = crypto.createHash("sha256").update(_name).digest("hex");
				let _cost = 1.0 * this.settings.cost_scale * this.cost.preset[preset] * this.cost.tune[tune] * this.cost.threads;
				let combo = {
					name: _name,
					hash: _hash,
					options: _opts,
					cost: _cost,
				};

				this.indexes[_hash] = combo.options;
				this.combinations.push(combo);
			}
		}
		
		fs.writeFileSync(
			path.join(this.config.paths.output, "libx264.json"),
			JSON.stringify(this.indexes, null, null),
			{encoding: "utf8"}
		);
		console.timeEnd("Generating...");
		console.log(`Combinations: ${this.count()}`)
	}

	pool() {
		return this.settings.pool;
	}

	get(index, width, height, framerate) {
		let result = Object.assign(new Object(), this.combinations[index]);
		result.cost *= framerate / 60.0;
		result.cost *= (width * height) / (2560 * 1440);
		return result;
	}
}

module.exports = libx264;
