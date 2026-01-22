export default async function handler(req, res) {
  // Configuración de permisos para que tu web pueda enviar datos
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. Recibimos handle o product_id y el valor del CSV
    const { product_id, handle, value } = req.body;
    
    // --- DATOS DE CONEXIÓN OBLIGATORIOS ---
    // Usamos el host interno para evitar el error de "dominio custom"
    const host = 'mundo-jm-test.myshopify.com'; 
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    const version = '2024-07';

    if (!token) {
      return res.status(500).json({ ok: false, error: "No se encontró el TOKEN en Vercel" });
    }

    // 2. Determinar el ID (GID) del producto
    // Si el CSV trae product_id lo usamos, si no, usamos el de cama-luton para la prueba
    const idLimpio = product_id || '49922626060590';
    const gid = `gid://shopify/Product/${idLimpio}`;

    const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;

    // 3. Consulta GraphQL para Shopify
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

    // 4. Revisar si hay errores
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
