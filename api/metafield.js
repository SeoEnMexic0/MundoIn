export default async function handler(req, res) {
  // Configuración de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { product_id, value } = req.body;
    const store = process.env.SHOPIFY_STORE;
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    const version = process.env.SHOPIFY_API_VERSION || '2024-07';

    // 1. VALIDACIÓN DE PARÁMETROS
    const faltantes = [];
    if (!store) faltantes.push("SHOPIFY_STORE (Variable de entorno)");
    if (!token) faltantes.push("SHOPIFY_ADMIN_TOKEN (Variable de entorno)");
    if (!product_id) faltantes.push("product_id (Falta el ID en el CSV)");
    if (!value) faltantes.push("value (Datos de sucursales vacíos)");

    if (faltantes.length > 0) {
      return res.status(400).json({ 
        ok: false, 
        error: `Faltan datos críticos: ${faltantes.join(', ')}` 
      });
    }

    // 2. LIMPIEZA DEL HOST (Soluciona el error de "mundo-jm-test.myshopify.com")
    // Esto quita "https://" y cualquier dominio personalizado, dejando solo el .myshopify.com
    const cleanHost = store.replace(/^https?:\/\//, '').split('/')[0];
    const host = cleanHost.includes('.myshopify.com') ? cleanHost : `${cleanHost}.myshopify.com`;

    // 3. PREPARACIÓN DE DATOS
    const gid = `gid://shopify/Product/${product_id}`;
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : value;

    const query = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }
    `;

    const variables = {
      metafields: [
        {
          ownerId: gid,
          namespace: "custom",
          key: "sucursales",
          type: "json",
          value: valueStr
        }
      ]
    };

    // 4. PETICIÓN A SHOPIFY
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
      return res.status(422).json({ ok: false, error: "Error de validación Shopify", detalles: userErrors });
    }

    return res.status(200).json({ ok: true, gid });

  } catch (error) {
    console.error("Error en API:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
