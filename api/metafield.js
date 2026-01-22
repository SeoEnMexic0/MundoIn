export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { product_id, value } = req.body;
    const host = 'mundo-jm-test.myshopify.com';
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    const gid = `gid://shopify/Product/${product_id}`;
    const gqlUrl = `https://${host}/admin/api/2024-07/graphql.json`;

    const mutation = `mutation($m:[MetafieldsSetInput!]!){metafieldsSet(metafields:$m){metafields{id}userErrors{message}}}`;
    const variables = {
      m: [{ ownerId: gid, namespace: 'custom', key: 'sucursales', type: 'json', value: JSON.stringify(value) }]
    };

    const response = await fetch(gqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: mutation, variables })
    });

    const result = await response.json();
    return res.status(200).json({ ok: true, result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
