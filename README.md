BloomFilter.js
==============

A small, dependency-free JavaScript Bloom filter implementation suitable for production use in Node.js and browsers.

A Bloom filter is a probabilistic set-membership data structure:

- `false` means the value is definitely not present.
- `true` means the value may be present.
- It can return false positives.
- It should not return false negatives unless the filter is corrupted or restored with incompatible settings.
- It does not support deletion. Use a counting Bloom filter if deletes are required.

## Installation

```bash
npm install bloomfilter
```

For this repository directly:

```js
var BloomFilter = require("./bloomfilter").BloomFilter;
```

## Production usage

Prefer creating filters from capacity and target false-positive probability:

```js
var BloomFilter = require("./bloomfilter").BloomFilter;

var bloom = BloomFilter.create(1_000_000, 0.01);

bloom.add("user:123");

if (bloom.mightContain("user:123")) {
  // probably present
}
```

`BloomFilter.create(expectedInsertions, falsePositiveProbability)` computes the optimal bit size and number of hash functions for the target configuration.

## Backwards-compatible usage

The original API is still supported:

```js
var bloom = new BloomFilter(32 * 256, 16);

bloom.add("apple");
bloom.add("banana");

console.log(bloom.test("apple"));
console.log(bloom.test("orange"));
```

## API

### Constructor

```js
new BloomFilter(m, k)
new BloomFilter(bucketSnapshot, k)
```

- `m`: number of bits. It is rounded up to the nearest multiple of 32.
- `k`: number of hash functions.
- `bucketSnapshot`: array-like 32-bit bucket data from a previous filter.

### Factory

```js
BloomFilter.create(expectedInsertions, falsePositiveProbability)
```

Creates a filter using the standard Bloom filter formulas:

```text
m = -n * ln(p) / (ln(2)^2)
k = m / n * ln(2)
```

Where:

- `n` is the expected number of inserted values.
- `p` is the target false-positive probability.
- `m` is the bit size.
- `k` is the number of hash functions.

### Methods

```js
bloom.add(value)
bloom.test(value)
bloom.mightContain(value)
bloom.size()
bloom.bitSize()
bloom.numHashFunctions()
bloom.bitCount()
bloom.loadFactor()
bloom.estimatedFalsePositiveRate()
bloom.isOverCapacity()
bloom.toJSON()
BloomFilter.fromJSON(json)
```

Notes:

- `add(value)` returns `true` if at least one new bit was set.
- `test(value)` and `mightContain(value)` are equivalent. `mightContain` is recommended in production code because it communicates the probabilistic behavior.
- `size()` estimates cardinality from the fraction of set bits. It is not an exact count.
- `estimatedFalsePositiveRate()` estimates the current false-positive rate from the estimated cardinality.
- `isOverCapacity()` returns `true` when the estimated cardinality is above `expectedInsertions`, if the filter was created with `BloomFilter.create()`.

## Serialization

```js
var json = JSON.stringify(bloom);
var restored = BloomFilter.fromJSON(json);

console.log(restored.mightContain("user:123"));
```

The serialized format includes:

- format version
- hash algorithm identifier
- bit size
- hash function count
- capacity and target false-positive rate, when available
- insertion counter
- bucket data

## Monitoring in production

Track these values:

```js
bloom.size();
bloom.loadFactor();
bloom.estimatedFalsePositiveRate();
bloom.isOverCapacity();
```

When a filter exceeds its expected insertion count, the false-positive rate rises. Create a larger replacement filter or use a scalable Bloom filter strategy made of multiple filters.

## Hashing

This implementation uses FNV-1a with double hashing:

```text
h_i(x) = h1(x) + i * h2(x)
```

This avoids computing `k` independent hashes for every operation while preserving the behavior expected from a Bloom filter.

FNV-1a is fast and dependency-free, but it is not cryptographic. Do not use this package as a security boundary against adversarial input.

## Runtime characteristics

- Add: `O(k)`
- Query: `O(k)`
- Memory: `O(m)` bits
- No runtime dependencies
- Uses typed arrays when available
- Compatible with Node.js and browsers

## Testing

```bash
npm test
```

The test suite covers:

- backwards-compatible API behavior
- optimal parameter calculation
- invalid parameter validation
- serialization and restoration
- estimated cardinality
- current false-positive estimate
- sampled false-positive rate

## Production checklist

Before using this in a high-QPS or distributed service, decide:

1. Whether the filter is built once and then queried read-only, or mutated at runtime.
2. How snapshots are persisted and restored.
3. What false-positive threshold should trigger rebuild or rotation.
4. Whether each service instance can keep its own local filter, or whether a shared store such as RedisBloom is needed.
5. Whether input is trusted. For adversarial input, consider a keyed hash such as SipHash.
