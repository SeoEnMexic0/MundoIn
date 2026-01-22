export default async function handler(req, res) {
  // Configuración de permisos para que la web pueda comunicarse con esta función
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Recibimos los datos del CSV (handle o product_id y el valor)
    const { product_id, handle, value } = req.body;
    
    // --- CONFIGURACIÓN DE CONEXIÓN OBLIGATORIA ---
    // Forzamos el host interno para eliminar el error de "dominio custom"
    const host = 'mundo-jm-test.myshopify.com'; 
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    const version = '2024-07';

    if (!token) {
      return res.status(500).json({ ok: false, error: "Token no configurado en Vercel" });
    }

    // Usamos el ID del producto que recibimos del CSV
    // Si el CSV no trae ID, el sistema fallará. Asegúrate de tenerlo.
    const idFinal = product_id || '49922626060590'; 
    const gid = `gid://shopify/Product/${idFinal}`;

    const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;

    // 2. Definir la mutación para Shopify
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

    // 3. Ejecutar la llamada a la API de Shopify
    const response = await fetch(`https://${host}/admin/api/${version}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query, variables })
    });

    const result = await response.json();

    // 4. Revisar si hubo errores en la respuesta
    if (result.errors) {
      return res.status(500).json({ ok: false, error: "Error de Shopify", detalles: result.errors });
    }

    const userErrors = result?.data?.metafieldsSet?.userErrors || [];
    if (userErrors.length > 0) {
      return res.status(422).json({ ok: false, error: "Datos inválidos", detalles: userErrors });
    }

    // Éxito total
    return res.status(200).json({ ok: true, gid });

  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
