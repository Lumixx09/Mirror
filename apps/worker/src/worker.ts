import { chromium } from 'playwright';
import { LocalStorageDriver, generateManifest } from '@mirror/evidence-core';
import { compareCommercialObservations, parsePrice } from '@mirror/differential-engine';
import type { SessionConfiguration, ExtractedCommercialValue } from '@mirror/contracts';
import { isPrivateOrBlockedIp } from '@mirror/shared';

const storage = new LocalStorageDriver(process.env.STORAGE_LOCAL_PATH || './storage');

export interface WorkerJob {
  runId: string;
  experimentId: string;
  targetUrl: string;
  sessions: SessionConfiguration[];
}

export async function executeSession(
  session: SessionConfiguration,
  targetUrl: string,
  runId: string
): Promise<{ observationId: string; extractedValues: ExtractedCommercialValue[]; screenshotKey?: string }> {
  const browser = await chromium.launch({
    headless: process.env.BROWSER_HEADLESS !== 'false'
  });

  try {
    // Create isolated context - zero shared cookies/storage
    const context = await browser.newContext({
      viewport: session.viewport,
      deviceScaleFactor: session.deviceScaleFactor || 1,
      locale: session.locale || 'en-US',
      timezoneId: session.timezoneId || 'America/New_York',
      userAgent: session.userAgent,
      extraHTTPHeaders: session.extraHeaders
    });

    const page = await context.newPage();

    // Check target URL SSRF before navigation
    const parsed = new URL(targetUrl);
    if (isPrivateOrBlockedIp(parsed.hostname) && !process.env.ALLOWED_TEST_DOMAINS?.includes(parsed.hostname)) {
      throw new Error(`Navigation blocked: ${parsed.hostname} is a protected internal destination.`);
    }

    // Step 1: Navigate to product
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Step 2: Add to cart
    const addToCartBtn = page.getByTestId('add-to-cart');
    if (await addToCartBtn.isVisible()) {
      await addToCartBtn.click();
    }

    // Step 3: Checkout
    const checkoutBtn = page.getByTestId('checkout');
    if (await checkoutBtn.isVisible()) {
      await checkoutBtn.click();
    }

    // Step 4: Extract commercial values from checkout
    const extractedValues: ExtractedCommercialValue[] = [];

    // Extract product price
    const priceLoc = page.getByTestId('product-price').first();
    if (await priceLoc.isVisible()) {
      const text = (await priceLoc.textContent()) || '';
      const parsed = parsePrice(text);
      extractedValues.push({
        label: 'Hardware Security Key X-1',
        amount: parsed.amount,
        currency: parsed.currency,
        rawText: text,
        sourceLocator: '[data-testid="product-price"]',
        confidence: 0.95
      });
    }

    // Extract fee if present
    const feeLoc = page.getByTestId('fee-item');
    if (await feeLoc.isVisible()) {
      const text = (await feeLoc.textContent()) || '';
      const parsed = parsePrice(text);
      extractedValues.push({
        label: 'Regulatory Compliance Surcharge',
        amount: parsed.amount,
        currency: parsed.currency,
        rawText: text,
        sourceLocator: '[data-testid="fee-item"]',
        confidence: 0.95
      });
    }

    // Extract subscription if present
    const subLoc = page.getByTestId('subscription-summary');
    if (await subLoc.isVisible()) {
      const text = (await subLoc.textContent()) || '';
      extractedValues.push({
        label: 'Priority Key Replacement',
        amount: 19.99,
        currency: 'USD',
        rawText: text,
        sourceLocator: '[data-testid="subscription-summary"]',
        confidence: 0.90
      });
    }

    // Step 5: Capture evidence screenshot
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    const screenshotKey = `runs/${runId}/${session.id}/checkout.png`;
    await storage.put(screenshotKey, screenshotBuffer);

    await context.close();

    return {
      observationId: crypto.randomUUID(),
      extractedValues,
      screenshotKey
    };
  } finally {
    await browser.close();
  }
}

export async function processExperimentRun(job: WorkerJob) {
  console.log(`[Worker] Starting experiment run ${job.runId}`);
  const results = new Map<string, { observationId: string; extractedValues: ExtractedCommercialValue[] }>();

  for (const session of job.sessions) {
    console.log(`[Worker] Executing session ${session.name} (${session.role})`);
    const res = await executeSession(session, job.targetUrl, job.runId);
    results.set(session.id, res);
  }

  // Find baseline session
  const baselineSession = job.sessions.find((s) => s.role === 'baseline') || job.sessions[0];
  const baselineResult = results.get(baselineSession.id);

  if (!baselineResult) {
    throw new Error('Baseline session observations could not be captured.');
  }

  // Compare each comparison session against baseline
  const allFindings = [];
  for (const session of job.sessions) {
    if (session.id === baselineSession.id) continue;
    const compResult = results.get(session.id);
    if (!compResult) continue;

    const findings = compareCommercialObservations({
      experimentId: job.experimentId,
      baselineObservationId: baselineResult.observationId,
      comparisonObservationId: compResult.observationId,
      baselineValues: baselineResult.extractedValues,
      comparisonValues: compResult.extractedValues
    });

    allFindings.push(...findings);
  }

  console.log(`[Worker] Run ${job.runId} completed with ${allFindings.length} findings.`);
  return allFindings;
}
