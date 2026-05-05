var bf = require("../bloomfilter"),
    BloomFilter = bf.BloomFilter;

var assert = require("assert");

var jabberwocky = "`Twas brillig, and the slithy toves\n  Did gyre and gimble in the wabe:\nAll mimsy were the borogoves,\n  And the mome raths outgrabe.\n\n\"Beware the Jabberwock, my son!\n  The jaws that bite, the claws that catch!\nBeware the Jubjub bird, and shun\n  The frumious Bandersnatch!\"\n\nHe took his vorpal sword in hand:\n  Long time the manxome foe he sought --\nSo rested he by the Tumtum tree,\n  And stood awhile in thought.\n\nAnd, as in uffish thought he stood,\n  The Jabberwock, with eyes of flame,\nCame whiffling through the tulgey wood,\n  And burbled as it came!\n\nOne, two! One, two! And through and through\n  The vorpal blade went snicker-snack!\nHe left it dead, and with its head\n  He went galumphing back.\n\n\"And, has thou slain the Jabberwock?\n  Come to my arms, my beamish boy!\nO frabjous day! Callooh! Callay!'\n  He chortled in his joy.\n\n`Twas brillig, and the slithy toves\n  Did gyre and gimble in the wabe;\nAll mimsy were the borogoves,\n  And the mome raths outgrabe.";

var tests = [];

function test(name, fn) {
  tests.push({ name: name, fn: fn });
}

function inDelta(actual, expected, delta) {
  assert.ok(Math.abs(actual - expected) <= delta, actual + " not within " + delta + " of " + expected);
}

test("basic add/test", function() {
  var f = new BloomFilter(1000, 4),
      n1 = "Bess",
      n2 = "Jane";
  assert.strictEqual(f.add(n1), true);
  assert.strictEqual(f.test(n1), true);
  assert.strictEqual(f.test(n2), false);
});

test("add returns false when all bits were already set", function() {
  var f = new BloomFilter(1000, 4);
  assert.strictEqual(f.add("Bess"), true);
  assert.strictEqual(f.add("Bess"), false);
});

test("jabberwocky", function() {
  var f = new BloomFilter(1000, 4),
      n1 = jabberwocky,
      n2 = jabberwocky + "\n";
  f.add(n1);
  assert.strictEqual(f.test(n1), true);
  assert.strictEqual(f.test(n2), false);
});

test("basic uint32", function() {
  var f = new BloomFilter(1000, 4),
      n1 = "\u0100",
      n2 = "\u0101",
      n3 = "\u0103";
  f.add(n1);
  assert.strictEqual(f.test(n1), true);
  assert.strictEqual(f.test(n2), false);
  assert.strictEqual(f.test(n3), false);
});

test("small filter negative lookup", function() {
  var f = new BloomFilter(20, 10);
  f.add("abc");
  assert.strictEqual(f.test("wtf"), false);
});

test("works with integer types", function() {
  var f = new BloomFilter(1000, 4);
  f.add(1);
  assert.strictEqual(f.test(1), true);
  assert.strictEqual(f.test(2), false);
});

test("mightContain alias", function() {
  var f = new BloomFilter(1000, 4);
  f.add("apple");
  assert.strictEqual(f.mightContain("apple"), true);
  assert.strictEqual(f.mightContain("orange"), false);
});

test("size", function() {
  var f = new BloomFilter(1000, 4), i = -1;
  while (++i < 100) f.add(i);
  inDelta(f.size(), 97.014763, 1e-6);
  --i; while (++i < 1000) f.add(i);
  inDelta(f.size(), 1007.549320, 1e-6);
});

test("factory computes production parameters", function() {
  var f = BloomFilter.create(1000, 0.01);
  assert.strictEqual(f.expectedInsertions, 1000);
  assert.strictEqual(f.falsePositiveProbability, 0.01);
  assert.strictEqual(f.bitSize(), 9600);
  assert.strictEqual(f.numHashFunctions(), 7);
});

test("factory rejects invalid parameters", function() {
  assert.throws(function() { BloomFilter.create(0, 0.01); }, RangeError);
  assert.throws(function() { BloomFilter.create(100, 0); }, RangeError);
  assert.throws(function() { BloomFilter.create(100, 1); }, RangeError);
  assert.throws(function() { new BloomFilter(0, 4); }, RangeError);
  assert.throws(function() { new BloomFilter(100, 0); }, RangeError);
});

test("serialization round trip", function() {
  var f = BloomFilter.create(1000, 0.01);
  f.add("apple");
  f.add("banana");

  var restored = BloomFilter.fromJSON(JSON.stringify(f));
  assert.strictEqual(restored.mightContain("apple"), true);
  assert.strictEqual(restored.mightContain("banana"), true);
  assert.strictEqual(restored.mightContain("orange"), false);
  assert.strictEqual(restored.expectedInsertions, 1000);
  assert.strictEqual(restored.falsePositiveProbability, 0.01);
  assert.strictEqual(restored.bitSize(), f.bitSize());
  assert.strictEqual(restored.numHashFunctions(), f.numHashFunctions());
});

test("load factor and false positive estimate", function() {
  var f = BloomFilter.create(1000, 0.01), i = -1;
  assert.strictEqual(f.loadFactor(), 0);
  assert.strictEqual(f.estimatedFalsePositiveRate(), 0);
  while (++i < 1000) f.add("key-" + i);
  assert.ok(f.loadFactor() > 0);
  assert.ok(f.estimatedFalsePositiveRate() > 0);
  assert.ok(f.estimatedFalsePositiveRate() < 0.02);
});

test("observed false positive rate stays near target", function() {
  var f = BloomFilter.create(1000, 0.01),
      i = -1,
      falsePositives = 0,
      tests = 10000;

  while (++i < 1000) f.add("key-" + i);
  i = -1;
  while (++i < tests) {
    if (f.mightContain("other-" + i)) falsePositives++;
  }
  assert.ok(falsePositives / tests < 0.025);
});

(function run() {
  var failures = 0;

  tests.forEach(function(t) {
    try {
      t.fn();
      console.log("✓ " + t.name);
    } catch (error) {
      failures++;
      console.error("✗ " + t.name);
      console.error(error && error.stack || error);
    }
  });

  if (failures) {
    console.error(failures + " test(s) failed");
    process.exit(1);
  }

  console.log(tests.length + " tests passed");
})();
