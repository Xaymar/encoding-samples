// --------------------------------------------------------------------------------
// Development options (for user options, see config.json)
global.debug = false;


// --------------------------------------------------------------------------------
// Actual Code

// Import modules
const ffmpeg = require('./ffmpeg.js');
const poolqueue = require('./poolqueue.js');

const fs = require('fs');
const path = require('path');
const process = require('process');
const util = require('util');
const { config } = require('process');

// Define some Helpers
function float_eq(a, b, edge) { return (Math.abs(a - b) <= edge); }
function float_lt(a, b, edge) { return ((a + edge) < b); }
function float_le(a, b, edge) { return float_lt(a, b, edge) || float_eq(a, b, edge); }
function float_gt(a, b, edge) { return ((a - edge) > b); }
function float_ge(a, b, edge) { return float_gt(a, b, edge) || float_eq(a, b, edge); }
Object.size = function (obj) { var size = 0, key; for (key in obj) { if (obj.hasOwnProperty(key)) { size++; } } return size; };

// Actual Code
async function load_config() { // Load Configuration
	console.group("Loading configuration...");
	console.time("Total");

	let config = require('./config.json');
	// Resolve and create directories.
	for (let name in config.paths) {
		config.paths[name] = path.resolve(config.paths[name]);
		if (!fs.existsSync(config.paths[name])) {
			fs.mkdirSync(config.paths[name]);
		}
	}

	console.timeEnd("Total");
	console.groupEnd();
	return config;
}

async function load_encoders(config, ff) { // Load Encoders
	console.group("Loading encoders...");
	console.time("Total");

	let encoders = new Map();
	for (let name in config.encoders) {
		let encoder = config.encoders[name];

		// Is the encoder disabled, or invalid?
		if (!encoder || !encoder.enabled) {
			if (global.debug) console.debug(`${name} is disabled or invalid.`);
			continue;
		}

		// Does the encoder exist?
		if (!fs.existsSync(path.join(".", `encoder_${name}.js`))) {
			console.error(`${name} does not exist.`);
			continue;
		}

		// Attempt to load the encoder, if possible.
		console.group(name);
		console.time("Subtotal");
		try {
			let instance = new (require(`./encoder_${name}.js`))(ff, config, encoder);
			instance.load();
			encoders.set(name, instance);
		} catch (ex) {
			console.log(ex);
		}
		console.timeEnd("Subtotal");
		console.groupEnd();
	}

	console.timeEnd("Total");
	console.groupEnd();
	return encoders;
}

async function load_videos(config, ff) { // Load Videos
	console.group("Loading videos...");
	console.time("Total");

	let videos = new Map();
	let promises = []; // Asynchronous loading.
	for (let name in config.videos) {
		let video = config.videos[name];

		// Is the video disabled, or invalid?
		if (!video || !video.enabled) {
			if (global.debug) console.debug(`${name} is disabled or invalid.`);
			continue;
		}

		// Does the video exist?
		if (!fs.existsSync(path.join(config.paths.videos, `${name}.mkv`))) {
			console.error(`${name} does not exist.`);
			continue;
		}

		// Load video information asynchronously.
		promises.push(new Promise((resolve, reject) => {
			console.time(name);

			let file_name = path.join(config.paths.videos, `${name}.mkv`);
			let probeprom = ff.probe(file_name);
			probeprom.then((json) => {
				let data = new Object();

				data.name = name;
				data.info = json;
				data.caches = {};

				// File Information
				data.file_name = `${name}.mkv`;
				data.file_ext = path.extname(data.file_name);
				data.file_base = path.basename(data.file_name, data.file_ext);
				data.file = path.join(config.paths.videos, data.file_name);

				// Video Information
				data.resolution = { width: data.info.streams[0].width, height: data.info.streams[0].height };
				data.framerate = eval(data.info.streams[0].r_frame_rate);
				data.duration = data.info.streams[0].duration;

				// Color Information
				data.color = {};
				data.color.range = data.info.streams[0].color_range ? data.info.streams[0].color_range : 'tv';
				data.color.trc = data.info.streams[0].color_transfer ? data.info.streams[0].color_transfer : 'bt709';
				data.color.primaries = data.info.streams[0].color_primaries ? data.info.streams[0].color_primaries : 'bt709';
				data.color.matrix = data.info.streams[0].color_space ? data.info.streams[0].color_space : 'bt709';

				videos.set(data.name, data);
				console.timeEnd(name);
				resolve(data);
			});
		}));
	}

	await Promise.allSettled(promises);

	// Sort the videos list again. (We don't care about what order the user wants!)
	videos = new Map([...videos].sort((a, b) => a[0] > b[0] ? 1 : -1));

	console.timeEnd("Total");
	console.groupEnd();
	return videos;
}

async function create_caches(config, ff, videos, encoders) { // Create Caches
	console.group("Creating caches...");
	console.time("Total");

	for (let name of videos.keys()) {
		let video = videos.get(name);

		console.group(name);
		console.time("Subtotal");

		video.caches = new Map();
		for (let resolution of config.options.resolutions) {
			let aspect_ratio = (video.resolution.height / video.resolution.width);
			for (let framerate_scaling of config.options.framerate_scalings) {
				let height = (Math.round(resolution[0] * aspect_ratio * 0.5) * 2);
				// Skip resolutions that are too large horizontally.
				if (resolution[0] > video.resolution.width) {
					if (global.debug) console.debug(`${resolution[0]}x${height}x${(video.framerate * framerate_scaling)} skipped.`);
					continue;
				}

				// Create Cache Information
				let cache = {
					framerate: (video.framerate * framerate_scaling),
					width: resolution[0],
					height: height
				};
				cache.framerate_s = cache.framerate.toFixed(2);
				cache.duration = Math.floor(video.duration * video.framerate * framerate_scaling) / cache.framerate;
				let key = `${cache.width}x${cache.height}x${cache.framerate_s}`;
				cache.file = path.join(config.paths.cache, `${video.file_base}-${key}.mkv`);
				cache.queues = new Map();

				video.caches.set(`${key}`, cache);
			}
		}

		for (let key of video.caches.keys()) {
			let cache = video.caches.get(key);

			// Check if cache file already exists and is correct.
			if (fs.existsSync(cache.file)) {
				let info = ff.probeSync(cache.file);
				if ((info.streams)
					&& (info.streams.length > 0)
					&& (info.streams[0].width == cache.width)
					&& (info.streams[0].height == cache.height)
					&& float_eq(eval(info.streams[0].r_frame_rate), cache.framerate, 0.01)
					&& float_eq(info.streams[0].duration, video.duration, 0.1)) {
					if (global.debug) console.debug(`${key} already exists.`);
					continue;
				}
			}

			console.time(`${key} created`);
			let command = [
				"-y",
				"-hide_banner",
				"-v", "error",
				"-i", video.file,
				"-filter_complex", `fps=fps=${cache.framerate_s},scale=flags=bicubic+full_chroma_inp+full_chroma_int:w=${cache.width}:h=${cache.height},colorspace=all=bt709:range=tv:format=yuv420p`,
				"-an",
			];
			if (encoders.has("h264_nvenc")) {
				command.push(
					"-c:v", "h264_nvenc",
					"-profile:v", "high",
					"-preset", "p1",
					"-tune", "lossless",
					"-rc", "constqp",
					"-rc-lookahead", "0",
					"-multipass", "0",
					"-b:v", "0",
					"-minrate", "0",
					"-maxrate", "0",
					"-bufsize", "0",
					"-qp", "0",
					"-init_qpI", "0",
					"-init_qpP", "0",
					"-init_qpB", "0",
					"-bf", "0",
					"-g", `15`,
				);
			} else {
				command.push(
					"-c:v", "libx264",
					"-preset", "veryfast",
					"-crf", "0",
					"-b:v", "0",
					"-minrate", "0",
					"-maxrate", "0",
					"-bufsize", "0",
					"-g", `15`,
				);
			}
			command.push(cache.file);
			let res = ff.ffmpegSync(command);
			if (res.status != 0) {
				console.log(res.stderr.toString());
			}
			if (global.debug) console.log(res.stdout.toString(), res.stderr.toString());
			console.timeEnd(`${key} created`);
		}

		console.timeEnd("Subtotal");
		console.groupEnd(name);
	}

	console.timeEnd("Total");
	console.groupEnd();
	return videos;
}

async function queue(config, ff, videos, encoders) {
	console.group("Queueing...");
	console.time("Total");

	let promises = [];
	for (let video_key of videos.keys()) {
		promises.push(new Promise(async (resolve, reject) => {
			let video = videos.get(video_key);
			let video_promises = [];

			console.time(video_key);
			for (let cache_key of video.caches.keys()) {
				video_promises.push(new Promise(async (resolve1) => {
					let cache = video.caches.get(cache_key);

					let queue_commands = new poolqueue();
					let queue_files = new poolqueue();
					let queue_promises = new Array();

					for (let encoder_key of encoders.keys()) {
						let encoder = encoders.get(encoder_key);
						let encoder_pool = encoder.pool();
						let encoder_extra = encoder.extra();
						for (let idx = 0; idx < encoder.count(); idx++) {
							let command = encoder.get(idx, cache.width, cache.height, cache.framerate);
							for (let bitrate of config.options.bitrates) {
								for (let kfinterval of config.options.keyframeinterval) {
									queue_promises.push(new Promise((resolve2) => {
										let file = path.join(
											config.paths.output,
											video.name,
											cache_key,
											encoder_key,
											bitrate.toFixed(0),
											(cache.framerate * kfinterval).toFixed(0),
											`${command.hash}.mkv`
										);
										let file_json = path.join(
											config.paths.output,
											video.name,
											cache_key,
											encoder_key,
											bitrate.toFixed(0),
											(cache.framerate * kfinterval).toFixed(0),
											`${command.hash}.json`
										);

										// Check if this file already exists at the target location.
										if (fs.existsSync(file_json)) {
											// Don't need to check for a video here, since we only care about results.
											if (global.debug) console.debug(`${file} already completed.`);

											resolve2(false);
											return;
										}

										let line = [
											"-map", "0:v:0",
											"-an",
											"-c:v", encoder_key,
											"-g", (cache.framerate * kfinterval).toFixed(0),
											"-b:v", `${bitrate}k`,
											"-minrate", "0",
											"-maxrate", "0",
											"-bufsize", `${2 * bitrate}k`,
										].concat(command.options).concat(encoder_extra).concat([file]);

										queue_commands.push(encoder_pool, line, command.cost);
										queue_files.push(encoder_pool, [[file, file_json]], command.cost);

										resolve2(true);
									}));
								}
							}
						}
					}

					await Promise.allSettled(queue_promises);

					let data = {
						commands: queue_commands.finalize(),
						files: queue_files.finalize(),
					};
					cache.queues = data;

					resolve1(true);
				}));
			}

			await Promise.allSettled(video_promises);
			console.timeEnd(video_key);

			resolve();
		}));
	}
	await Promise.allSettled(promises);
	console.timeEnd("Total");
	console.groupEnd();
}

async function work(config, ff, videos, encoders) {
	// Process from here on out.
	// LOOP
	// 1. Pull out front of the command and file queue.
	// 2. Encode using the given command(s).
	// 3. Compare resulting files with real input (libvmaf).
	// 4. Delete encoded files.
	// 5. Repeat until queues empty, no more caches for video, and no more videos.

	let vmaf_model = ff.consolify(path.resolve(path.join(config.paths.ffmpeg, "vmaf", config.options.vmaf.model)));

	console.group("Processing...")
	console.time("Total");
	for (let video_key of videos.keys()) {
		console.group(video_key);
		console.time(video_key);
		let video = videos.get(video_key);
		for (let cache_key of video.caches.keys()) {
			console.time(cache_key);
			let cache = video.caches.get(cache_key);

			let length = cache.queues.commands.length;
			console.log(`0.0% (0 / ${length}): 0.000s`);
			while (cache.queues.commands.length > 0) {
				let commands = cache.queues.commands.shift();
				let files = cache.queues.files.shift();

				let prc1 = length - cache.queues.commands.length;
				let prc2 = prc1 / length * 100.0;
				let LABEL = `${prc2.toFixed(1)}% (${prc1} / ${length})`
				console.time(LABEL)
				console.group();

				// Create directories.
				for (let file of files) {
					fs.mkdirSync(path.dirname(file[0]), { recursive: true });
				}

				// Encode
				{
					console.time("Encoding");
					let opts = [
						"-y",
						"-hide_banner",
						"-v", "error",
						"-hwaccel", "auto",
						"-i", cache.file
					].concat(commands);
					let res = ff.ffmpegSync(opts);
					if (res.status != 0) {
						console.log(res.stdout.toString(), res.stderr.toString());
						continue;
					}
					console.timeEnd("Encoding");
				}

				/*
				Comparing VMAF instantly:
				- Saves disk space - no need to keep copies around!
				fn: .\ffmpeg.exe -i "..\..\cache\arma_3-002-1280x720x60.00.mkv" -i "..\..\videos\arma_3-002.mkv" -filter_complex_threads 8 -filter_complex [0:v:0]scale=flags=bicubic+full_chroma_inp+full_chroma_int:w=1920:h=1080,colorspace=all=bt709:range=pc,format=pix_fmts=yuv444p[main];[1:v:0]colorspace=all=bt709:range=pc,format=pix_fmts=yuv444p[ref];[main][ref]libvmaf=model_path=../vmaf/vmaf_4k_rb_v0.6.2.pkl:log_fmt=json:log_path=here2.json:enable_conf_interval=1:shortest=1[out] -map [out] -f null -
				
				*/

				// Process
				{
					console.time("Processing");
					let opts = [
						"-hide_banner",
						"-v", "warning",
						"-hwaccel", "auto",
						"-i", video.file,
					];
					let filter = "";
					let references = [];

					// Build Filter Graph
					if (files.length > 1) {
						filter = `[0:v:0]split=${files.length}`
						for (let idx = 0; idx < files.length; idx++) {
							filter = `${filter}[ref:${idx}]`;
							references[idx] = `[ref:${idx}]`;
						}
						filter = `${filter}`
					} else {
						references[0] = "[0:v:0]";
					}

					// Rescale and Resample all inputs and compare them.
					for (let idx = 0; idx < files.length; idx++) {
						let file = files[idx];						
						opts.push("-i", file[0]);

						if (filter != "")
							filter = `${filter};` // [temp:${idx}];[temp:${idx}]
						filter = `${filter}[${idx}:v:0]scale=flags=bicubic+full_chroma_inp+full_chroma_int:w=${video.resolution.width.toFixed(0)}:h=${video.resolution.height.toFixed(0)},colorspace=space=${video.color.matrix}:trc=${video.color.trc}:primaries=${video.color.primaries}:range=${video.color.range},format=pix_fmts=yuv444p,fps=fps=${video.framerate.toFixed(2)},[ref:${idx}]libvmaf=model_path=${vmaf_model}:log_fmt=json:log_path=${ff.consolify(file[1])}:enable_conf_interval=1:n_threads=2[main:${idx}]`
					}

					opts.push("-filter_complex", filter);
					for (let idx = 0; idx < files.length; idx++) {
						opts.push(
							"-map", `[main:${idx}]`,
							"-f", "null",
							"-"
						)
					}

					console.log(opts);
					let res = ff.ffmpegSync(opts);
					if (res.status != 0) {
						console.log(res.stdout.toString(), res.stderr.toString());
						continue;
					}
					console.timeEnd("Processing");
				}

				console.log(filter);

				console.groupEnd();
				console.timeEnd(LABEL);
			}
			console.timeEnd(cache_key);
		}
		console.timeEnd(video_key);
		console.groupEnd();
	}
	console.timeEnd("Total");
	console.groupEnd();
}

async function main() {
	let config;
	let ff;
	let encoders;
	let videos;

	await load_config().then((p) => { config = p; });
	ff = new ffmpeg(config.paths.ffmpeg);
	await load_encoders(config, ff).then((p) => { encoders = p; });
	await load_videos(config, ff).then((p) => { videos = p; });
	await create_caches(config, ff, videos, encoders);
	await queue(config, ff, videos, encoders);
	await work(config, ff, videos, encoders);
}

main();
