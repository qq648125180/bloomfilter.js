const { BloomFilter } = require("./bloomfilter");

// Create a Bloom filter with 8192 bits and 16 hash functions
const bloom = new BloomFilter(32 * 256, 16);

// Add values
bloom.add("apple");
bloom.add("banana");
bloom.add("grape");

// Test values
console.log("apple:", bloom.test("apple"));   // true
console.log("banana:", bloom.test("banana")); // true
console.log("orange:", bloom.test("orange")); // probably false

// Show estimated size
console.log("Estimated size:", bloom.size());

// Serialize
const data = Array.from(bloom.buckets);

// Restore
const bloom2 = new BloomFilter(data, 16);
console.log("apple (restored):", bloom2.test("apple"));