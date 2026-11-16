# MIRROR Differential Analysis Engine

## 1. Objective

Compare browser observations to identify meaningful differences while
minimizing false positives and preserving the provenance of every
finding.

The engine must be deterministic for identical normalized inputs.

## 2. Processing pipeline

1.  Validate observation schema.
2.  Preserve raw observation.
3.  Normalize a copy.
4.  Align corresponding pages and journey checkpoints.
5.  Run specialized comparators.
6.  Merge related differences.
7.  Classify findings.
8.  Calculate confidence and rationale.
9.  Persist findings with evidence references.

## 3. Comparison modules

### DOM structure

Compare normalized element trees, roles, accessible names, selected
attributes, visibility and relevant form state.

Ignore irrelevant generated IDs and unstable attributes only through
documented rules. Never remove attributes that may represent meaningful
differences.

### Visible text

Normalize whitespace and safe Unicode differences. Preserve original
text. Detect additions, removals and modifications.

### Semantic/commercial values

Extract and compare: - Product price - Original price - Discounted
price - Shipping - Tax - Fee - Subscription price - Cart subtotal -
Checkout total - Currency - Default selections

Each extracted value must include source locator, raw text, parsed
value, currency and extraction method.

Do not assume every number is a price.

### Visual

Compare screenshots only when viewport, scale and capture state are
sufficiently aligned. Generate overlays and pixel difference summaries.
Visual difference alone must not be treated as proof of a behavioural or
commercial difference.

### Behavioural

Compare action outcomes, navigation destinations, step counts, form
defaults, visibility and interaction results.

### Network

Compare selected request metadata and status. Do not treat every request
difference as meaningful. Redact secrets.

## 4. Normalization

-   Normalize whitespace.
-   Normalize Unicode safely.
-   Preserve raw values.
-   Preserve decimal precision and currency.
-   Distinguish null, missing, empty and zero.
-   Normalize only known volatile attributes.
-   Record normalizer version.
-   Do not discard meaningful query parameters from URLs.
-   Keep locale-specific number parsing explicit.

## 5. Price extraction

Use a layered approach: 1. User-configured selectors 2. Structured
metadata such as JSON-LD 3. Accessible labels and semantic markup 4.
Visible DOM text

Every extraction returns: - `rawText` - `amount` - `currency` -
`label` - `source` - `confidence` - `observationId`

Ambiguous extraction should be labelled uncertain, not silently
accepted.

## 6. Finding classification

Suggested types: - `price_difference` - `fee_difference` -
`subscription_difference` - `default_selection_difference` -
`content_difference` - `structure_difference` - `journey_difference` -
`navigation_difference` - `visual_difference` - `network_difference` -
`unknown_difference`

Severity must be rule-based and explainable. Do not equate severity with
wrongdoing.

Classification: - `confirmed_observation` - `supported_interpretation` -
`hypothesis`

## 7. Confidence

Confidence is not a decorative number. Document the calculation.

Consider: - Extraction reliability - Observation completeness - Session
comparability - Repeated-run consistency - Source quality - Temporal
uncertainty

Expose confidence rationale and limitations. Do not present 0.99 merely
because a value was extracted exactly once.

## 8. Repeated runs and confounders

Differences may arise from time, A/B tests, stock, changing campaigns,
geolocation, currency, caching or server-side experiments.

Support: - Repeated baseline and comparison runs - Session ordering
controls - Synchronized windows where feasible - Configuration
fingerprints - Environmental metadata - Volatile-content filters -
Unknown-cause classification

Never attribute a difference to a user characteristic unless the
experiment actually controls that variable and the evidence supports the
inference.

## 9. Tests

Use unit and property-based tests.

Required invariants: - Identical normalized inputs yield no semantic
findings. - Attribute order alone does not change semantic comparison. -
A genuine price change remains detectable. - Missing is not zero. -
Currency mismatch is not silently compared as same-currency. - Repeated
identical inputs produce deterministic output. - Evidence references
always resolve. - Failed sessions are never treated as successful
observations.
