export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { product_id, value } = req.body;
    
    // CAMBIA ESTO por tu dominio real de .myshopify.com
    // Ejemplo: 'mundo-in.myshopify.com'
    const host = 'mundo-jm-test.myshopify.com'; 
    
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    const version = '2024-07';

    if (!token) throw new Error("Token no configurado en Vercel");
    if (!product_id) throw new Error("Falta el product_id");

    const gid = `gid://shopify/Product/${product_id}`;
    const gqlUrl = `https://${host}/admin/api/${version}/graphql.json`;

    // Aseguramos que el valor sea un String JSON puro
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : value;

    const mutation = `mutation($m:[MetafieldsSetInput!]!){metafieldsSet(metafields:$m){metafields{id}userErrors{message}}}`;
    const variables = {
      m: [{ 
        ownerId: gid, 
        namespace: 'custom', 
        key: 'sucursales', 
        type: 'json', 
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

    // Verificamos si Shopify devolvió errores de usuario
    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
        return res.status(400).json({ 
            ok: false, 
            error: result.data.metafieldsSet.userErrors[0].message 
        });
    }

    return res.status(200).json({ ok: true, result });

  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
