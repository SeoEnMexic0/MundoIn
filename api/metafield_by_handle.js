export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { handle, value } = req.body;
    const store = process.env.SHOPIFY_STORE;
    const version = process.env.SHOPIFY_API_VERSION || '2024-07';
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    if (!store || !token || !handle || !value) {
      return res.status(400).json({ ok: false, error: 'Faltan parámetros' });
    }

    const host = store.includes('.myshopify.com') ? store : `${store}.myshopify.com`;
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;
    const gqlUrl = `https://${host}/admin/api/${version}/graphql.json`;

    // Buscar producto por handle
    const findQuery = `query($h:String!){productByHandle(handle:$h){id}}`;
    const findRes = await fetch(gqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query: findQuery, variables: { h: handle.toLowerCase() } })
    });

    const findResult = await findRes.json();
    const gid = findResult?.data?.productByHandle?.id;

    if (!gid) {
      return res.status(404).json({ ok: false, error: 'Producto no encontrado', handle });
    }

    // Actualizar metafield
    const query = `mutation($m:[MetafieldsSetInput!]!){metafieldsSet(metafields:$m){metafields{id}userErrors{message}}}`;
    const variables = {
      m: [{ ownerId: gid, namespace: 'custom', key: 'sucursales', type: 'json', value: valueStr }]
    };

    const response = await fetch(gqlUrl, {
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

    res.status(200).json({ ok: true, gid, handle });

  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}
