export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { store, version, token, product_id, value } = req.body;

    if (!store || !version || !token || !product_id || !value) {
      return res.status(400).json({ ok: false, error: 'Faltan parámetros requeridos' });
    }

    const gid = `gid://shopify/Product/${product_id}`;
    
    const query = `
      mutation metafieldsSet($m: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $m) {
          metafields { id namespace key value type }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      m: [{
        ownerId: gid,
        namespace: "custom",
        key: "sucursales",
        type: "json",
        value: typeof value === 'object' ? JSON.stringify(value) : value
      }]
    };

    const response = await fetch(`https://${store}/admin/api/${version}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query, variables })
    });

    const result = await response.json();

    if(result.errors || (result.data?.metafieldsSet?.userErrors?.length > 0)) {
      return res.status(500).json({ 
        ok: false, 
        error: 'Shopify rechazó la petición', 
        details: result.errors || result.data.metafieldsSet.userErrors 
      });
    }

    return res.status(200).json({ 
      ok: true, 
      metafield: result.data.metafieldsSet.metafields[0] 
    });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
