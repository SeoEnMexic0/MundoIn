export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { product_id, value } = req.body;
    
    // --- ESTO ELIMINA EL ERROR DEL DOMINIO ---
    // No importa lo que diga la web, aquí forzamos el host interno de Shopify
    const host = 'mundo-jm-test.myshopify.com'; 
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    const version = '2024-07';

    if (!token) {
      return res.status(500).json({ ok: false, error: "Falta el TOKEN en Vercel" });
    }

    // Usamos el ID del producto (asegúrate que el CSV tenga la columna product_id)
    const idFinal = product_id || '49922626060590'; 
    const gid = `gid://shopify/Product/${idFinal}`;

    const query = `
      mutation metafieldsSet($m: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $m) {
          metafields { id }
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

    // La petición se hace estrictamente a .myshopify.com
    const response = await fetch(`https://${host}/admin/api/${version}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query, variables })
    });

    const result = await response.json();

    if (result.errors) {
      return res.status(500).json({ ok: false, error: "Shopify rechazó la conexión", detalles: result.errors });
    }

    return res.status(200).json({ ok: true, gid });

  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
