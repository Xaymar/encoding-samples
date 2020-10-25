const encoder = require('./encoder.js');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

let version = 1;

class h264_nvenc extends encoder {
	constructor(ffmpeg, config, settings) {
		super(ffmpeg, config, settings);
	}
	
	available() {
		console.time("Checking...");
		let res = ff.ffmpegSync([
			"-hide_banner", "-v", "quiet",
			"-f", "lavfi",
			"-i", "color=size=256x256:duration=1:rate=30:color=black",
			"-c:v", "h264_nvenc",
			"-f", "null",
			"-"
		]);
		console.timeEnd("Checking...");
		if (res.status != 0) {
			return false;
		}
		return true;
	}

	available() {
		console.time("Checking...");
		let res = this.ffmpeg.ffmpegSync([
			"-hide_banner", "-v", "error",
			"-f", "lavfi",
			"-i", "color=size=256x256:duration=1:rate=30:color=black",
			"-c:v", "h264_nvenc",
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
				for (let rcla of this.settings["rc-lookahead"]) {
					for (let ia of [0, 1]) {
						if ((rcla == 0) && (ia != 0)) { // Requires lookahead.
							continue;
						}
						for (let bf of this.settings.bf) {
							for (let bfm of ["disabled", "middle"]) {
								if ((bf == 0) && (bfm != "disabled")) { // Requires B-Frames
									continue;
								}
								for (let mp of [0, 1, 2]) {
									for (let taq of [0, 1]) {
										for (let saqs of [0, 7, 15]) {
											let _opts = [
												"-profile:v", "high",
												"-preset", preset,
												"-tune", tune,
												"-rc", "cbr",
												"-cbr", 1,
												"-rc-lookahead", rcla,
												"-no-scenecut", 1 - ia,
												"-bf", bf,
												"-b_ref_mode", bfm,
												"-b_adapt", 1,
												"-multipass", mp,
												"-temporal_aq", taq,
											];
											if (saqs == 0) {
												_opts.push(
													"-spatial-aq", 0,
												);
											} else {
												_opts.push(
													"-spatial-aq", 1,
													"-aq-strength", saqs,
												);
											}

											let _name = name(_opts);
											let _hash = crypto.createHash("sha256").update(_name).digest("hex");
											let _cost = (1.0 / this.settings.parallel) * 1.01;
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
								}
							}
						}
					}
				}
			}
		}
		
		fs.writeFileSync(
			path.join(this.config.paths.output, "h264_nvenc.json"),
			JSON.stringify(this.indexes, null, null),
			{encoding: "utf8"}
		);
		console.timeEnd("Generating...");
		console.log(`Combinations: ${this.combinations.length}`)
	}

	pool() {
		return this.settings.pool;
	}

	get(index, width, height, framerate) {
		return this.combinations[index];
	}

/*
for (let br of _config.bitrates)
	"-b:v", `${br.toFixed(0)}k`,
	"-bufsize", `${(br * 2).toFixed(0)}k`,
	"-minrate", "0",
	"-maxrate", `${br.toFixed(0)}k`,
for (let kfm of _config.keyframe_multiplier)
	"-g", (_cache.fps * kfm).toFixed(0),
*/
}

module.exports = h264_nvenc;
