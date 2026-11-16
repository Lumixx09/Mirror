import express from 'express';

const app = express();
const PORT = process.env.DEMO_STORE_PORT || 4001;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Helper for variant detection from query param or header
function getVariant(req: express.Request): 'A' | 'B' | 'C' {
  const v = (req.query.variant || req.headers['x-mirror-variant'] || 'A') as string;
  if (v.toUpperCase() === 'B') return 'B';
  if (v.toUpperCase() === 'C') return 'C';
  return 'A';
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'demo-store' });
});

// Product Page
app.get('/product', (req, res) => {
  const variant = getVariant(req);
  const isSubChecked = variant === 'C';

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MIRROR Controlled Store - Security Key Standard</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 40px; }
    .container { max-width: 600px; margin: 0 auto; background: #1e293b; padding: 32px; border-radius: 8px; border: 1px solid #334155; }
    .badge { display: inline-block; padding: 4px 10px; background: #6366f1; color: white; border-radius: 4px; font-size: 12px; margin-bottom: 16px; font-weight: bold; }
    h1 { margin-top: 0; font-size: 24px; }
    .price-tag { font-size: 28px; font-weight: bold; color: #38bdf8; margin: 16px 0; }
    .btn { background: #38bdf8; color: #0f172a; border: none; padding: 12px 24px; font-weight: bold; border-radius: 6px; cursor: pointer; text-decoration: none; display: inline-block; }
    .btn:hover { background: #7dd3fc; }
    .option-box { background: #0f172a; padding: 16px; border-radius: 6px; margin: 20px 0; border: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="container">
    <span class="badge">CONTROLLED EXPERIMENT TARGET (VARIANT ${variant})</span>
    <h1>Hardware Security Key X-1</h1>
    <p>FIDO2 & WebAuthn compliant enterprise security token.</p>
    
    <div class="price-tag" data-testid="product-price">$49.00</div>

    <form action="/cart" method="GET">
      <input type="hidden" name="variant" value="${variant}">
      
      <div class="option-box">
        <label>
          <input type="checkbox" name="subscription" value="true" data-testid="subscription-toggle" ${isSubChecked ? 'checked' : ''}>
          Enroll in Priority Key Replacement Protection ($19.99/mo)
        </label>
      </div>

      <button type="submit" class="btn" data-testid="add-to-cart">Add to cart</button>
    </form>
  </div>
</body>
</html>`);
});

// Cart Page
app.get('/cart', (req, res) => {
  const variant = getVariant(req);
  const hasSub = req.query.subscription === 'true';

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MIRROR Controlled Store - Cart</title>
  <style>
    body { font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
    .container { max-width: 600px; margin: 0 auto; background: #1e293b; padding: 32px; border-radius: 8px; border: 1px solid #334155; }
    .btn { background: #38bdf8; color: #0f172a; padding: 12px 24px; border-radius: 6px; font-weight: bold; text-decoration: none; display: inline-block; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Your Cart</h1>
    <p>1x Hardware Security Key X-1</p>
    <div data-testid="cart-subtotal" style="font-size: 20px; font-weight: bold; margin-bottom: 24px;">$49.00</div>
    <a href="/checkout?variant=${variant}&subscription=${hasSub}" class="btn" data-testid="checkout">Proceed to Checkout</a>
  </div>
</body>
</html>`);
});

// Checkout Page
app.get('/checkout', (req, res) => {
  const variant = getVariant(req);
  const hasSub = req.query.subscription === 'true';

  const basePrice = 49.00;
  const fee = variant === 'B' ? 8.00 : 0.00;
  const total = basePrice + fee;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>MIRROR Controlled Store - Checkout</title>
  <style>
    body { font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; }
    .container { max-width: 600px; margin: 0 auto; background: #1e293b; padding: 32px; border-radius: 8px; border: 1px solid #334155; }
    .row { display: flex; justify-content: space-between; margin: 12px 0; }
    .total-row { font-size: 22px; font-weight: bold; border-top: 1px solid #475569; padding-top: 16px; margin-top: 16px; }
    .highlight { color: #f43f5e; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container" data-testid="order-summary">
    <h1>Order Summary</h1>
    
    <div class="row">
      <span>Hardware Security Key X-1</span>
      <span data-testid="product-price">$49.00</span>
    </div>

    ${variant === 'B' ? `
    <div class="row highlight">
      <span>Regulatory Compliance Surcharge</span>
      <span data-testid="fee-item">$8.00</span>
    </div>` : ''}

    ${hasSub ? `
    <div class="row" style="color: #a78bfa;">
      <span data-testid="subscription-summary">Priority Key Replacement (Auto-renews monthly)</span>
      <span>$19.99/mo</span>
    </div>` : ''}

    <div class="row total-row">
      <span>Total Amount</span>
      <span data-testid="checkout-total">$${total.toFixed(2)}</span>
    </div>

    <p style="color: #94a3b8; font-size: 14px; margin-top: 24px;">Controlled Test Environment. No real payment processing enabled.</p>
  </div>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`Demo store listening on port ${PORT}`);
});
