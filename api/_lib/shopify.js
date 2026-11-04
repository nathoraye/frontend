export const DEPARTMENT_PRODUCTS_QUERY = `
  query GetDepartmentProducts($handle: String!) {
    collection(handle: $handle) {
      id
      title
      description
      products(first: 12) {
        edges {
          node {
            id
            title
            handle
            availableForSale
            onlineStoreUrl
            priceRange { minVariantPrice { amount currencyCode } }
            featuredImage { url altText }
            tags
          }
        }
      }
    }
  }
`;

/** Only fixed department handles are accepted; this is not a general GraphQL proxy. */
export async function getDepartmentCollection(handle) {
  if (!['west-vinyl-custom', 'west-made-crafts', 'west-finds-collectables'].includes(handle)) {
    throw Object.assign(new Error('Unknown department.'), { status: 400 });
  }
  const domain = (process.env.SHOPIFY_STORE_DOMAIN || '').trim();
  const token = (process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || '').trim();
  const version = (process.env.SHOPIFY_STOREFRONT_API_VERSION || '').trim();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) || !token || !/^\d{4}-(01|04|07|10)$/.test(version)) {
    throw Object.assign(new Error('The shop is not connected yet. Please contact us for product enquiries.'), { status: 503 });
  }
  try {
    const response = await fetch(`https://${domain}/api/${version}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': token },
      body: JSON.stringify({ query: DEPARTMENT_PRODUCTS_QUERY, variables: { handle } }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Upstream HTTP error');
    const payload = await response.json();
    if (payload.errors?.length || !payload.data || !('collection' in payload.data)) {
      throw new Error('Upstream GraphQL error');
    }
    return payload.data.collection;
  } catch {
    // Never expose Shopify errors, request headers, or credentials in public responses.
    throw Object.assign(new Error('Products could not be loaded. Please try again shortly.'), { status: 502 });
  }
}
