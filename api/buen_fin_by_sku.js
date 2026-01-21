export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { sku } = req.body;
    const store = process.env.SHOPIFY_STORE;
    const version = process.env.SHOPIFY_API_VERSION || '2024-07';
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    if (!store || !token || !sku) {
      return res.status(400).json({ ok: false, error: 'Faltan parámetros' });
    }

    const host = store.includes('.myshopify.com') ? store : `${store}.myshopify.com`;
    const gqlUrl = `https://${host}/admin/api/${version}/graphql.json`;

    // Buscar por SKU
    const findQuery = `query($q:String!){productVariants(first:50,query:$q){edges{node{sku product{id}}}}}`;
    const findRes = await fetch(gqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query: findQuery, variables: { q: `sku:${sku}` } })
    });

    const findResult = await findRes.json();
    const edges = findResult?.data?.productVariants?.edges || [];

    let productGid = null;
    for (const edge of edges) {
      if (edge.node.sku?.toLowerCase().includes(sku.toLowerCase())) {
        productGid = edge.node.product.id;
        break;
      }
    }

    if (!productGid) {
      return res.status(404).json({ ok: false, error: `SKU no encontrado: ${sku}` });
    }

    // Establecer metafield buen_fin
    const query = `mutation($m:[MetafieldsSetInput!]!){metafieldsSet(metafields:$m){metafields{id}userErrors{message}}}`;
    const variables = {
      m: [{ ownerId: productGid, namespace: 'custom', key: 'buen_fin', type: 'boolean', value: 'true' }]
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

    res.status(200).json({ ok: true, sku, product_gid: productGid });

  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}
