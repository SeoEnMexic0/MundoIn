export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { product_id, value } = req.body;
    
    // --- TIENDA REAL ---
    const host = 'mundo-in.myshopify.com'; 
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    const gid = `gid://shopify/Product/${product_id.trim()}`;
    const gqlUrl = `https://${host}/admin/api/2024-07/graphql.json`;

    const variables = {
      metafields: [{
        ownerId: gid,
        namespace: "custom",
        key: "sucursales",
        type: "json",
        value: typeof value === 'object' ? JSON.stringify(value) : value
      }]
    };

    const mutation = `mutation m($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }`;

    const response = await fetch(gqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: mutation, variables })
    });

    const result = await response.json();

    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
      console.error("ERROR REAL:", result.data.metafieldsSet.userErrors);
      return res.status(400).json({ ok: false, error: result.data.metafieldsSet.userErrors[0].message });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
