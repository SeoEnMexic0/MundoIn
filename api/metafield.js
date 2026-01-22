export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { product_id, value } = req.body;
    
    // --- CONFIGURACIÓN FORZADA ---
    // Forzamos el host correcto para eliminar el error de "dominio custom"
    const host = 'mundo-jm-test.myshopify.com'; 
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    const version = '2024-07';

    // Validación de datos del CSV
    if (!product_id || !value) {
      return res.status(400).json({ 
        ok: false, 
        error: `Faltan datos en el CSV. ID: ${product_id ? 'OK' : 'VACÍO'}, Valores: ${value ? 'OK' : 'VACÍO'}` 
      });
    }

    if (!token) {
      return res.status(500).json({ ok: false, error: "No se encontró el TOKEN en el servidor" });
    }

    const gid = `gid://shopify/Product/${product_id}`;
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;

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
        value: valueStr
      }]
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

    if (result.errors) {
      return res.status(500).json({ ok: false, error: "Error de Shopify", detalles: result.errors });
    }

    const userErrors = result?.data?.metafieldsSet?.userErrors || [];
    if (userErrors.length > 0) {
      return res.status(422).json({ ok: false, error: "Error de validación", detalles: userErrors });
    }

    return res.status(200).json({ ok: true, gid });

  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
