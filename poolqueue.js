
class poolqueue {
	constructor() {
		this.queues = new Array();
		this.index = {};
		this.costs = {};
	}

	clear() {
		this.queues = new Array();
		this.index = {};
		this.costs = {};
	}

	push(name, command, cost) {
		if (!this.index[name]) {
			this.index[name] = 0;
		}
		if (!this.costs[name]) {
			this.costs[name] = 0;			
		}

		// Make sure Queue exists
		if (!this.queues[this.index[name]]) {
			this.queues[this.index[name]] = new Array();
			if (global.debug) console.debug(`${name}: Created new pool.`);
		}

		// Push the new command.
		this.queues[this.index[name]] = this.queues[this.index[name]].concat(command);

		this.costs[name] += cost;
		if (this.costs[name] > 1.0) {
			this.index[name]++;
			if (global.debug) console.debug(`${name}: Incremented index to ${this.index[name]} due to cost ${this.costs[name]}.`);
			this.costs[name] = 0.0;
		}
	}

	finalize() {
		return this.queues;
	}
}

module.exports = poolqueue;
