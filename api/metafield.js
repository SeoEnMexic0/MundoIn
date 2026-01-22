export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { product_id, value } = req.body;
    
    // CONFIGURACIÓN MUNDO IN
    const host = 'mundo-in.myshopify.com'; 
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    const version = '2024-07';

    if (!token) throw new Error("Token no configurado en Vercel");
    if (!product_id) throw new Error("Falta el ID en el CSV");

    // CAMBIO CLAVE: Ahora usamos ProductVariant en lugar de Product
    const gid = `gid://shopify/ProductVariant/${product_id.trim()}`;
    const gqlUrl = `https://${host}/admin/api/${version}/graphql.json`;

    const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;

    const mutation = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      metafields: [{
        ownerId: gid,
        namespace: "custom",
        key: "sucursales",
        type: "json",
        value: stringValue
      }]
    };

    const response = await fetch(gqlUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'X-Shopify-Access-Token': token 
      },
      body: JSON.stringify({ query: mutation, variables })
    });

    const result = await response.json();

    if (result.errors || result.data?.metafieldsSet?.userErrors?.length > 0) {
      const errorMsg = result.errors ? result.errors[0].message : result.data.metafieldsSet.userErrors[0].message;
      return res.status(400).json({ ok: false, error: errorMsg });
    }

    return res.status(200).json({ ok: true, result });

  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
