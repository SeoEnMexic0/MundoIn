export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { sku } = req.body;
    const host = 'mundo-jm-test.myshopify.com';
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    const gqlUrl = `https://${host}/admin/api/2024-07/graphql.json`;
    
    // Buscar por SKU
    const findQuery = `query($q:String!){ products(first:1, query:$q){ edges{ node{ id } } } }`;
    const findRes = await fetch(gqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: findQuery, variables: { q: `sku:${sku}` } })
    });

    const findData = await findRes.json();
    const gid = findData?.data?.products?.edges[0]?.node?.id;

    if (!gid) return res.status(404).json({ ok: false, error: 'SKU no encontrado' });

    // Activar buen_fin = true
    const mutation = `mutation($m:[MetafieldsSetInput!]!){metafieldsSet(metafields:$m){metafields{id}userErrors{message}}}`;
    const variables = {
      m: [{ ownerId: gid, namespace: 'custom', key: 'buen_fin', type: 'boolean', value: "true" }]
    };

    await fetch(gqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: mutation, variables })
    });

    return res.status(200).json({ ok: true, product_gid: gid, http: { matched_strategy: 'exact' } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
