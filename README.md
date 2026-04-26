Bloom Filter (Teaching Version)
============

This is a simple JavaScript implementation of a **Bloom Filter**, designed for
learning and understanding the data structure.

---

## What is a Bloom Filter?

A Bloom Filter is a probabilistic data structure used to test whether an element
is in a set.

It has two key properties:

- It may return **false positives** (says "exists" but actually doesn't)
- It will **never return false negatives** (if it says "not exists", it is correct)

---

## How it works

1. You hash a value into multiple positions (k hash functions)
2. Set those positions to 1 in a bit array
3. To check a value:
   - If any bit is 0 → definitely NOT in set
   - If all bits are 1 → probably in set

---

## Parameters

- `m` = number of bits (size of the filter)
- `k` = number of hash functions

Tradeoff:

- larger `m` → fewer false positives
- larger `k` → more accuracy but slower

---

## Usage

```js
var BloomFilter = require("./bloomfilter").BloomFilter;

var bloom = new BloomFilter(32 * 256, 16);

bloom.add("apple");
bloom.add("banana");

console.log(bloom.test("apple"));   // true
console.log(bloom.test("orange"));  // probably false
```

---

## Important Notes

- You **cannot delete elements** from a Bloom Filter
- You must reuse the same `k` when restoring from serialized data

```js
var array = [].slice.call(bloom.buckets);
var bloom2 = new BloomFilter(array, 16);
```

---

## Why only 2 hash functions?

This implementation uses a trick called **double hashing**:

Instead of computing k independent hashes, it uses:

    h1(x), h1(x)+h2(x), h1(x)+2*h2(x), ...

This is faster and widely used in practice.

---

## Learning Focus

This repo is intentionally simple:

- no dependencies
- no build step
- readable implementation

Perfect for understanding how Bloom Filters work internally.

---

[Original idea and reference]
http://isthe.com/chongo/tech/comp/fnv/
