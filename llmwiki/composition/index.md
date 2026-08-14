# Composition

The dependency layer OKF leaves out of scope: how one bundle's knowledge
becomes navigable from another's, what trust the two vendored subtrees
encode, and how conflicting or cyclic dependencies are refused rather than
silently resolved.

* [deps/ versus vendor/](/llmwiki/composition/deps-and-vendor.md) - the trust split and what each command writes into the two subtrees
* [Vendoring's link rewrite](/llmwiki/composition/rewriting.md) - why every vendored link is a depth-independent prefix substitution
* [Version conflicts and cycles](/llmwiki/composition/conflicts.md) - flat hoisting, and why llmwiki refuses instead of nesting
