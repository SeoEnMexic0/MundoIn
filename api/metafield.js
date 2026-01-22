@ -0,0 +1,50 @@
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { product_id, value } = req.body;
    const store = process.env.SHOPIFY_STORE;
    const version = process.env.SHOPIFY_API_VERSION || '2024-07';
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    if (!store || !token || !product_id || !value) {
      return res.status(400).json({ ok: false, error: 'Faltan parámetros' });
    }

    const host = store.includes('.myshopify.com') ? store : `${store}.myshopify.com`;
    const gid = `gid://shopify/Product/${product_id}`;
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;

    const query = `mutation($m:[MetafieldsSetInput!]!){metafieldsSet(metafields:$m){metafields{id}userErrors{message}}}`;
    const variables = {
      m: [{ ownerId: gid, namespace: 'custom', key: 'sucursales', type: 'json', value: valueStr }]
    };

    const response = await fetch(`https://${host}/admin/api/${version}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query, variables })
    });

    const result = await response.json();
    const errors = result?.data?.metafieldsSet?.userErrors || [];

    if (errors.length > 0) {
      return res.status(422).json({ ok: false, error: errors });
    }

    res.status(200).json({ ok: true, gid });

  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}
