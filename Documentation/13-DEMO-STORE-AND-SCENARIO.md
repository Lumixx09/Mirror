# MIRROR Controlled Demo Store and Showcase Scenario

## 1. Purpose

Build a first-party demo website that makes MIRROR's core capabilities
deterministic and independently verifiable. The demo must be clearly
labelled as a controlled test environment.

Do not hardcode expected findings in MIRROR's differential engine. The
engine must discover differences from browser observations.

## 2. Demo store variants

### Variant A: Baseline

-   Product price: USD 49.00
-   No additional fee
-   Optional subscription, not selected by default
-   Standard checkout

### Variant B: Additional fee

-   Product price: USD 49.00
-   Additional USD 8.00 fee shown at checkout
-   Otherwise comparable journey

### Variant C: Preselected subscription

-   Product price: USD 49.00
-   Subscription option selected by default
-   Checkout summary exposes the selected option

All variants must be deterministic and accessible through stable test
IDs.

## 3. Stable selectors

Provide test IDs for: - Product price - Add to cart - Cart subtotal -
Checkout button - Fee line item - Subscription option - Subscription
summary - Order summary - Confirmation state

Use accessible labels and roles as well.

## 4. Test journey

1.  Navigate to product page.
2.  Capture product state.
3.  Add product to cart.
4.  Wait for cart summary.
5.  Navigate to checkout.
6.  Capture checkout state.
7.  Extract price, fee and subscription state.
8.  End without submitting an actual order.

No payment processing is required. No financial transaction must occur.

## 5. Expected observations

The engine should independently discover: - Baseline checkout total
differs from the additional-fee variant. - Subscription default state
differs in the subscription variant.

The application must not contain preloaded findings presented as live
results. Fixtures may be used in unit tests only.

## 6. Three-minute demonstration flow

Suggested sequence: - 0:00--0:20: Explain the problem and MIRROR. -
0:20--0:45: Create an investigation and configure three sessions. -
0:45--1:25: Run the experiment and show real browser execution. -
1:25--2:05: Show detected fee and subscription differences. -
2:05--2:35: Open evidence and explain provenance. - 2:35--2:55: Export
and rerun the experiment. - 2:55--3:00: Close with the product's value.

Adapt to the official video duration requirement and keep the final
video below the permitted maximum.

## 7. Demo reliability

-   Seed deterministic data.
-   Provide a reset mechanism.
-   Avoid external payment services.
-   Avoid external target dependencies for the core demo.
-   Run the demo repeatedly before recording.
-   Prepare a fallback recording, but do not present a recording as live
    execution.
