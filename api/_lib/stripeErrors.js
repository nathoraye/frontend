/** Build a safe JSON error body for Stripe/API failures (never includes secrets). */
export function stripeErrorPayload(error, fallbackMessage) {
  const message =
    error instanceof Error ? error.message : fallbackMessage || 'Request failed';
  const payload = { error: message };
  if (error?.stripeType) payload.stripeType = error.stripeType;
  if (error?.type && !payload.stripeType) payload.stripeType = error.type;
  if (error?.networkCode) payload.networkCode = error.networkCode;
  if (error?.networkMessage) payload.networkMessage = error.networkMessage;
  if (error?.code && typeof error.code === 'string' && error.code.length < 64) {
    payload.stripeCode = error.code;
  }
  return payload;
}

export function logStripeFailure(route, error) {
  console.error(`[${route}]`, {
    message: error instanceof Error ? error.message : String(error),
    stripeType: error?.stripeType || error?.type || null,
    networkCode: error?.networkCode || null,
    networkMessage: error?.networkMessage || null,
    stripeCode: error?.code || null,
    statusCode: error?.statusCode || null,
  });
}
