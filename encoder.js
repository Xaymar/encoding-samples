class encoder {
	constructor(ffmpeg, config, settings) {
		// FFmpeg
		this.ffmpeg = ffmpeg;

		// Configuration
		this.config = config;

		// Encoder Settings
		this.settings = settings; // Settings

		// Check if this encoder is available.
		if (!this.available()) {
			throw new ReferenceError("Encoder is not available");
		}
	}

	available() {
		return true;
	}

	load() {
		this.indexes = {};
		this.combinations = [];
	}

	pool() {
		return "default";
	}

	count() {
		return this.combinations.length;
	}

	get(index, width, height, framerate) {
		throw new Error("Not Implemented");
	}
}

module.exports = encoder;
