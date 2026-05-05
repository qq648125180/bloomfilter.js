(function(exports) {
  "use strict";

  exports.BloomFilter = BloomFilter;
  exports.fnv_1a = fnv_1a;
  exports.fnv_1a_b = fnv_1a_b;

  var typedArrays = typeof ArrayBuffer !== "undefined";
  var VERSION = 1;
  var HASH_ALGORITHM = "fnv-1a-double-hashing";

  // Creates a new bloom filter.
  //
  // Backwards-compatible constructor:
  //   new BloomFilter(m, k)
  //   new BloomFilter(serializedBuckets, k)
  //
  // Production-friendly factory:
  //   BloomFilter.create(expectedInsertions, falsePositiveProbability)
  //
  // If m is an array-like object, the filter is loaded from bucket data.
  // Otherwise, m is the number of bits and is rounded up to a multiple of 32.
  function BloomFilter(m, k, options) {
    var a;
    options = options || {};

    if (typeof m !== "number") {
      a = m;
      if (!a || typeof a.length !== "number") {
        throw new TypeError("m must be a positive number of bits or an array-like bucket snapshot");
      }
      m = a.length * 32;
    }

    validatePositiveInteger(m, "m");
    validatePositiveInteger(k, "k");

    var n = Math.ceil(m / 32);
    var i = -1;

    this.m = n * 32;
    this.k = k;
    this.expectedInsertions = options.expectedInsertions || null;
    this.falsePositiveProbability = options.falsePositiveProbability || null;
    this.hashAlgorithm = HASH_ALGORITHM;
    this.insertions = options.insertions || 0;

    if (typedArrays) {
      this.buckets = new Int32Array(n);
      if (a) {
        if (a.length !== n) throw new Error("bucket snapshot length does not match filter size");
        while (++i < n) this.buckets[i] = a[i] | 0;
      }
      this._locations = new Uint32Array(k);
    } else {
      this.buckets = [];
      if (a) {
        if (a.length !== n) throw new Error("bucket snapshot length does not match filter size");
        while (++i < n) this.buckets[i] = a[i] | 0;
      } else {
        while (++i < n) this.buckets[i] = 0;
      }
      this._locations = [];
    }
  }

  // Builds a filter from capacity and target false-positive probability.
  BloomFilter.create = function(expectedInsertions, falsePositiveProbability) {
    validatePositiveInteger(expectedInsertions, "expectedInsertions");
    validateFalsePositiveProbability(falsePositiveProbability);

    var m = BloomFilter.optimalNumOfBits(expectedInsertions, falsePositiveProbability);
    var k = BloomFilter.optimalNumOfHashFunctions(expectedInsertions, m);

    return new BloomFilter(m, k, {
      expectedInsertions: expectedInsertions,
      falsePositiveProbability: falsePositiveProbability
    });
  };

  BloomFilter.optimalNumOfBits = function(expectedInsertions, falsePositiveProbability) {
    validatePositiveInteger(expectedInsertions, "expectedInsertions");
    validateFalsePositiveProbability(falsePositiveProbability);
    return Math.ceil(-expectedInsertions * Math.log(falsePositiveProbability) / (Math.LN2 * Math.LN2));
  };

  BloomFilter.optimalNumOfHashFunctions = function(expectedInsertions, bitSize) {
    validatePositiveInteger(expectedInsertions, "expectedInsertions");
    validatePositiveInteger(bitSize, "bitSize");
    return Math.max(1, Math.round(bitSize / expectedInsertions * Math.LN2));
  };

  BloomFilter.fromJSON = function(json) {
    if (typeof json === "string") json = JSON.parse(json);
    if (!json || typeof json !== "object") throw new TypeError("invalid bloom filter JSON");
    if (json.version !== VERSION) throw new Error("unsupported bloom filter version: " + json.version);
    if (json.hashAlgorithm && json.hashAlgorithm !== HASH_ALGORITHM) {
      throw new Error("unsupported hash algorithm: " + json.hashAlgorithm);
    }
    if (!json.buckets || typeof json.buckets.length !== "number") {
      throw new Error("invalid bloom filter bucket snapshot");
    }
    return new BloomFilter(json.buckets, json.k, {
      expectedInsertions: json.expectedInsertions || null,
      falsePositiveProbability: json.falsePositiveProbability || null,
      insertions: json.insertions || 0
    });
  };

  // Computes the k bit locations for value v using double hashing.
  BloomFilter.prototype.locations = function(v) {
    var k = this.k;
    var m = this.m;
    var r = this._locations;
    var a = fnv_1a(v);
    var b = fnv_1a_b(a);
    var i = -1;
    var x = a % m;

    while (++i < k) {
      r[i] = x < 0 ? x + m : x;
      x = (x + b) % m;
    }
    return r;
  };

  // Adds a value. Returns true when at least one new bit was set.
  BloomFilter.prototype.add = function(v) {
    var l = this.locations(v + "");
    var i = -1;
    var k = this.k;
    var buckets = this.buckets;
    var changed = false;

    while (++i < k) {
      var bit = l[i];
      var index = bit >>> 5;
      var mask = 1 << (bit & 31);
      var old = buckets[index];
      var value = old | mask;
      if (value !== old) {
        buckets[index] = value;
        changed = true;
      }
    }
    this.insertions++;
    return changed;
  };

  // Tests whether a value may be present.
  BloomFilter.prototype.test = function(v) {
    var l = this.locations(v + "");
    var i = -1;
    var k = this.k;
    var buckets = this.buckets;

    while (++i < k) {
      var bit = l[i];
      if ((buckets[bit >>> 5] & (1 << (bit & 31))) === 0) return false;
    }
    return true;
  };

  // Alias with clearer probabilistic semantics for production code.
  BloomFilter.prototype.mightContain = BloomFilter.prototype.test;

  BloomFilter.prototype.bitSize = function() {
    return this.m;
  };

  BloomFilter.prototype.numHashFunctions = function() {
    return this.k;
  };

  BloomFilter.prototype.bitCount = function() {
    var buckets = this.buckets;
    var bits = 0;
    for (var i = 0, n = buckets.length; i < n; ++i) bits += popcnt(buckets[i]);
    return bits;
  };

  BloomFilter.prototype.loadFactor = function() {
    return this.bitCount() / this.m;
  };

  // Estimated unique cardinality from the fraction of set bits.
  BloomFilter.prototype.size = function() {
    var bits = this.bitCount();
    if (bits === 0) return 0;
    if (bits >= this.m) return Infinity;
    return -this.m * Math.log(1 - bits / this.m) / this.k;
  };

  BloomFilter.prototype.estimatedFalsePositiveRate = function(insertions) {
    var n = insertions == null ? this.size() : insertions;
    if (n <= 0) return 0;
    return Math.pow(1 - Math.exp(-this.k * n / this.m), this.k);
  };

  BloomFilter.prototype.isOverCapacity = function() {
    return this.expectedInsertions != null && this.size() > this.expectedInsertions;
  };

  BloomFilter.prototype.toJSON = function() {
    return {
      version: VERSION,
      hashAlgorithm: HASH_ALGORITHM,
      m: this.m,
      k: this.k,
      expectedInsertions: this.expectedInsertions,
      falsePositiveProbability: this.falsePositiveProbability,
      insertions: this.insertions,
      buckets: Array.prototype.slice.call(this.buckets)
    };
  };

  BloomFilter.prototype.toObject = BloomFilter.prototype.toJSON;

  function validatePositiveInteger(value, name) {
    if (typeof value !== "number" || !isFinite(value) || value <= 0 || Math.floor(value) !== value) {
      throw new RangeError(name + " must be a positive integer");
    }
  }

  function validateFalsePositiveProbability(value) {
    if (typeof value !== "number" || !isFinite(value) || value <= 0 || value >= 1) {
      throw new RangeError("falsePositiveProbability must be a number between 0 and 1");
    }
  }

  // Counts the number of 1 bits in a 32-bit integer.
  function popcnt(v) {
    v -= (v >> 1) & 0x55555555;
    v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
    return ((v + (v >> 4) & 0xF0F0F0F) * 0x1010101) >>> 24;
  }

  // Fowler/Noll/Vo hashing.
  function fnv_1a(v) {
    var n = v.length;
    var a = 2166136261;
    var c;
    var d;
    var i = -1;

    while (++i < n) {
      c = v.charCodeAt(i);
      if (d = c & 0xff000000) {
        a ^= d >> 24;
        a += (a << 1) + (a << 4) + (a << 7) + (a << 8) + (a << 24);
      }
      if (d = c & 0xff0000) {
        a ^= d >> 16;
        a += (a << 1) + (a << 4) + (a << 7) + (a << 8) + (a << 24);
      }
      if (d = c & 0xff00) {
        a ^= d >> 8;
        a += (a << 1) + (a << 4) + (a << 7) + (a << 8) + (a << 24);
      }
      a ^= c & 0xff;
      a += (a << 1) + (a << 4) + (a << 7) + (a << 8) + (a << 24);
    }

    a += a << 13;
    a ^= a >> 7;
    a += a << 3;
    a ^= a >> 17;
    a += a << 5;
    return a & 0xffffffff;
  }

  function fnv_1a_b(a) {
    a += (a << 1) + (a << 4) + (a << 7) + (a << 8) + (a << 24);
    a += a << 13;
    a ^= a >> 7;
    a += a << 3;
    a ^= a >> 17;
    a += a << 5;
    return a & 0xffffffff;
  }
})(typeof exports !== "undefined" ? exports : this);
