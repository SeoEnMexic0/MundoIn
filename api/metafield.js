export default async function handler(req, res) {
  // 1. Configurar permisos (CORS) para que tu página web pueda llamar a esta función
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responder rápido a la verificación del navegador
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 2. Recibir los datos del CSV (ID del producto y los valores de sucursales)
    const { product_id, value } = req.body;
    
    // --- DATOS DE CONEXIÓN SEGUROS ---
    const host = 'mundo-jm-test.myshopify.com'; 
    const token = process.env.SHOPIFY_ADMIN_TOKEN; // Se saca de la configuración de Vercel
    const version = '2024-07';

    // 3. Validar que todo esté en orden antes de llamar a Shopify
    if (!token) {
      return res.status(500).json({ ok: false, error: "Falta el TOKEN en Vercel (SHOPIFY_ADMIN_TOKEN)" });
    }

    if (!product_id || !value) {
      return res.status(400).json({ 
        ok: false, 
        error: `Datos incompletos. ID: ${product_id || 'VACÍO'}` 
      });
    }

    // 4. Preparar la estructura para Shopify
    const gid = `gid://shopify/Product/${product_id}`;
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;

    // Consulta GraphQL (La forma más eficiente de actualizar metafields)
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

    // 5. Enviar la actualización a Shopify
    const response = await fetch(`https://${host}/admin/api/${version}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query, variables })
    });

    const result = await response.json();

    // 6. Revisar si Shopify aceptó el cambio
    if (result.errors) {
      return res.status(500).json({ ok: false, error: "Error de Shopify", detalles: result.errors });
    }

    const userErrors = result?.data?.metafieldsSet?.userErrors || [];
    if (userErrors.length > 0) {
      return res.status(422).json({ ok: false, error: "Datos inválidos", detalles: userErrors });
    }

    // ¡LISTO!
    return res.status(200).json({ ok: true, mensaje: "Producto actualizado!", gid });

  } catch (error) {
    return res.status(500).json({ ok: false, error: "Error del servidor: " + error.message });
  }
}
